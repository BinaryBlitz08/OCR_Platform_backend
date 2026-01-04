const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const fs = require('fs');
const FormDataNode = require('form-data');
const { PDFDocument, rgb } = require('pdf-lib');
const Document = require('../models/Document');
const auth = require('../middleware/auth');
const { Document: DocxDocument, Packer, Paragraph } = require('docx');
// Multer: temporary storage for uploaded files
const upload = multer({ dest: 'storage/uploads/' });

// Output directory for generated files
const OUTPUT_DIR = path.join(__dirname, '../storage/outputs');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// ML OCR Service URL (dummy or real FastAPI)
const ML_OCR_URL = process.env.ML_SERVICE_URL || 'http://localhost:8001/ocr';

// ======================== UPLOAD ROUTE ========================
router.post('/upload', auth, upload.array('files'), async (req, res) => {
  const files = req.files || [];

  if (files.length === 0) {
    return res.status(400).json({ message: 'No files uploaded' });
  }

  const results = [];

  for (const file of files) {
    const fileId = uuidv4();
    const originalPath = file.path;

    try {
      if (!fs.existsSync(originalPath)) {
        throw new Error('Temporary upload file missing');
      }

      // Use buffer instead of stream — fast and reliable on Windows
      const fileBuffer = fs.readFileSync(originalPath);

      const formData = new FormDataNode();
      formData.append('files', fileBuffer, {
        filename: file.originalname,
        contentType: file.mimetype || 'application/octet-stream',
      });

      const mlResponse = await axios.post(ML_OCR_URL, formData, {
        headers: formData.getHeaders(),
        timeout: 30000,
      });

      const extractedText = 
        mlResponse.data?.concatenated?.text ||
        mlResponse.data?.results?.[0]?.text ||
        mlResponse.data?.text ||
        'No text extracted';

      // Save to DB (user-specific)
      const doc = await Document.create({
        user: req.user.id,
        originalFilename: file.originalname,
        extractedText,
        fileId,
      });

      const basePath = path.join(OUTPUT_DIR, fileId);

      // TXT — always generated (fast)
      fs.writeFileSync(`${basePath}.txt`, extractedText);

      // PDF & DOCX — commented for speed during demo
      // Uncomment when real model is ready and you want full exports
    
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([600, 800]);
      page.drawText(extractedText, { x: 50, y: 750, size: 12 });
      fs.writeFileSync(`${basePath}.pdf`, await pdfDoc.save());

      const docx = new DocxDocument({
        sections: [{ children: [new Paragraph(extractedText)] }],
      });
      fs.writeFileSync(`${basePath}.docx`, await Packer.toBuffer(docx));
      

      results.push({
        documentId: doc._id,
        fileId,
        originalFilename: file.originalname,
        preview: extractedText.substring(0, 200) + (extractedText.length > 200 ? '...' : ''),
        downloads: {
          text: `/api/ocr/download/${fileId}/text`,
          pdf: `/api/ocr/download/${fileId}/pdf`,
          docx: `/api/ocr/download/${fileId}/docx`,
        },
      });
    } catch (error) {
      console.error(`OCR failed for ${file.originalname}:`, error.message);
      results.push({
        originalFilename: file.originalname,
        error: error.response?.data?.detail || error.message || 'Processing failed',
      });
    } finally {
      // Always clean up temporary file
      if (fs.existsSync(originalPath)) {
        fs.unlinkSync(originalPath);
      }
    }
  }

  res.json({
    message: 'OCR processing complete',
    results,
  });
});

// ======================== DOWNLOAD ROUTE ========================
router.get('/download/:fileId/:type', auth, async (req, res) => {
  const { fileId, type } = req.params;
  const validTypes = ['text', 'pdf', 'docx'];

  if (!validTypes.includes(type)) {
    return res.status(400).json({ message: 'Invalid file type' });
  }

  const ext = type === 'text' ? 'txt' : type;
  const filepath = path.join(OUTPUT_DIR, `${fileId}.${ext}`);

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ message: 'File not found' });
  }

  const doc = await Document.findOne({ fileId, user: req.user.id });
  if (!doc) {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  const filename = `${path.parse(doc.originalFilename).name}.${ext}`;
  res.download(filepath, filename);
});

// ======================== HISTORY ROUTE ========================
router.get('/history', auth, async (req, res) => {
  try {
    const docs = await Document.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('originalFilename createdAt fileId extractedText')
      .lean();

    const history = docs.map(d => ({
      id: d._id,
      fileId: d.fileId,
      filename: d.originalFilename,
      uploadedAt: d.createdAt.toISOString(),
      preview: d.extractedText.substring(0, 150) + (d.extractedText.length > 150 ? '...' : ''),
    }));

    res.json(history);
  } catch (err) {
    console.error('History error:', err);
    res.status(500).json({ message: 'Failed to load history' });
  }
});

module.exports = router;
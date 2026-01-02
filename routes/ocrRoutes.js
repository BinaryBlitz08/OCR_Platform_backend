// routes/ocrRoutes.js

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
const { Document: DocxDocument, Packer, Paragraph } = require('docx');

const Document = require('../models/Document');
const auth = require('../middleware/auth');

const upload = multer({ dest: 'storage/uploads/' });

const OUTPUT_DIR = path.join(__dirname, '../storage/outputs');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const ML_OCR_URL = process.env.ML_SERVICE_URL || 'http://ml-service:6000/ocr';

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

      const formData = new FormData();
      formData.append('file', fs.createReadStream(originalPath));

      const mlResponse = await axios.post(ML_OCR_URL, formData, {
        headers: formData.getHeaders(),
      });

      const extractedText = (mlResponse.data.text || '').trim();

      const doc = await Document.create({
        user: req.user.id,
        originalFilename: file.originalname,
        extractedText,
        fileId,
      });

      const basePath = path.join(OUTPUT_DIR, fileId);

    
      fs.writeFileSync(`${basePath}.txt`, extractedText);

      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([600, 800]);
      page.drawText(extractedText, {
        x: 50,
        y: 750,
        size: 12,
        maxWidth: 500,
      });
      fs.writeFileSync(`${basePath}.pdf`, await pdfDoc.save());

      const docx = new DocxDocument({
        sections: [{
          children: [new Paragraph(extractedText || 'No text extracted')],
        }],
      });
      fs.writeFileSync(`${basePath}.docx`, await Packer.toBuffer(docx));

      fs.unlinkSync(originalPath);

      results.push({
        documentId: doc._id,
        fileId,
        originalFilename: file.originalname,
        preview: extractedText.slice(0, 200) + (extractedText.length > 200 ? '...' : ''),
        downloads: {
          text: `/api/ocr/download/${fileId}/text`,
          pdf: `/api/ocr/download/${fileId}/pdf`,
          docx: `/api/ocr/download/${fileId}/docx`,
        },
      });
    } catch (err) {
      console.error(`OCR failed for ${file.originalname}:`, err.message);
      results.push({
        originalFilename: file.originalname,
        error: err.response?.data?.detail || err.message || 'Processing failed',
      });

      if (fs.existsSync(originalPath)) fs.unlinkSync(originalPath);
    }
  }

  res.json({
    message: 'OCR processing complete',
    results,
  });
});

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
    return res.status(403).json({ message: 'Unauthorized access' });
  }

  const filename = `${path.parse(doc.originalFilename).name}.${ext}`;
  res.download(filepath, filename);
});

router.get('/history', auth, async (req, res) => {
  try {
    const docs = await Document.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('originalFilename createdAt extractedText fileId');

    const history = docs.map(d => ({
      id: d._id,
      fileId: d.fileId,
      filename: d.originalFilename,
      uploadedAt: d.createdAt.toISOString(),
      preview: d.extractedText.slice(0, 150) + (d.extractedText.length > 150 ? '...' : ''),
    }));

    res.json(history);
  } catch (err) {
    res.status(500).json({ message: 'Failed to load history' });
  }
});

module.exports = router;
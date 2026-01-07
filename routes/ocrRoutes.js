const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const FormDataNode = require('form-data');
const { PDFDocument, rgb } = require('pdf-lib');
const { Document: DocxDocument, Packer, Paragraph } = require('docx');
const auth = require('../middleware/auth');
const DocumentModel = require('../models/Document');

const upload = multer({ dest: 'storage/uploads/' });

const OUTPUT_DIR = path.join(__dirname, '../storage/outputs');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const ML_OCR_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000/ocr';


async function generatePDF(text) {
  const pdfDoc = await PDFDocument.create();
  let currentPage = pdfDoc.addPage([600, 800]); // Use 'let' to allow reassigning
  const lines = text.match(/(.|[\r\n]){1,90}/g) || [];
  let y = 750;

  for (const line of lines) {
    if (y < 50) {
      currentPage = pdfDoc.addPage([600, 800]); // Correctly switch to the new page
      y = 750;
    }
    currentPage.drawText(line.trim(), { x: 50, y, size: 12 });
    y -= 14;
  }
  return await pdfDoc.save();
}

// Generate DOCX
async function generateDOCX(text) {
  const doc = new DocxDocument({
    sections: [{ children: [new Paragraph(text)] }],
  });
  return await Packer.toBuffer(doc);
}

router.post('/upload', auth, upload.array('files'), async (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ message: 'No files uploaded' });

  const results = await Promise.allSettled(
    files.map(async (file) => {
      const fileId = uuidv4();
      const originalPath = file.path;
      const basePath = path.join(OUTPUT_DIR, fileId);

      try {
        if (!fs.existsSync(originalPath)) throw new Error('Temporary file missing');

        const buffer = fs.readFileSync(originalPath);
        const formData = new FormDataNode();
        formData.append('files', buffer, {
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

        const doc = await DocumentModel.create({
          user: req.user.id,
          originalFilename: file.originalname,
          extractedText,
          fileId,
        });

        // TXT
        fs.writeFileSync(`${basePath}.txt`, extractedText);

        // PDF
        fs.writeFileSync(`${basePath}.pdf`, await generatePDF(extractedText));

        // DOCX
        fs.writeFileSync(`${basePath}.docx`, await generateDOCX(extractedText));

        return {
          documentId: doc._id,
          fileId,
          originalFilename: file.originalname,
          preview: extractedText.substring(0, 200) + (extractedText.length > 200 ? '...' : ''),
          downloads: {
            text: `/api/ocr/download/${fileId}/text`,
            pdf: `/api/ocr/download/${fileId}/pdf`,
            docx: `/api/ocr/download/${fileId}/docx`,
          },
        };
      } catch (error) {
        console.error(`OCR failed for ${file.originalname}:`, error.message);
        return {
          originalFilename: file.originalname,
          error: error.response?.data?.detail || error.message || 'Processing failed',
        };
      } finally {
        if (fs.existsSync(originalPath)) fs.unlinkSync(originalPath);
      }
    })
  );

  res.json({
    message: 'OCR processing complete',
    results: results.map(r => (r.status === 'fulfilled' ? r.value : { error: r.reason })),
  });
});

router.get('/download/:fileId/:type', auth, async (req, res) => {
  const { fileId, type } = req.params;
  const validTypes = ['text', 'pdf', 'docx'];
  if (!validTypes.includes(type)) return res.status(400).json({ message: 'Invalid file type' });

  const ext = type === 'text' ? 'txt' : type;
  const filepath = path.join(OUTPUT_DIR, `${fileId}.${ext}`);
  if (!fs.existsSync(filepath)) return res.status(404).json({ message: 'File not found' });

  const doc = await DocumentModel.findOne({ fileId, user: req.user.id });
  if (!doc) return res.status(403).json({ message: 'Unauthorized' });

  const filename = `${path.parse(doc.originalFilename).name}.${ext}`;
  res.download(filepath, filename);
});

router.get('/history', auth, async (req, res) => {
  try {
    const docs = await DocumentModel.find({ user: req.user.id })
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

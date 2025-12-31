const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { PDFDocument } = require('pdf-lib');
const { Document: DocxDocument, Packer, Paragraph } = require('docx');
const fs = require('fs');
const Document = require('../models/Document');
const auth = require('../middleware/auth');

const router = express.Router();
const upload = multer({ dest: 'storage/uploads/' });

const OUTPUT_DIR = path.join(__dirname, '../storage/outputs');

router.post('/upload', auth, upload.array('files'), async (req, res) => {
  const results = [];
  for (const file of req.files) {
    const fileId = uuidv4();
    const originalPath = file.path;

    try {
      const formData = new FormData();
      formData.append('image', fs.createReadStream(originalPath));
      const mlResponse = await axios.post(process.env.ML_SERVICE_URL, formData, {
        headers: formData.getHeaders()
      });
      const extractedText = mlResponse.data.text || '';

      await Document.create({
        user: req.user.id,
        originalFilename: file.originalname,
        extractedText,
        fileId
      });

      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage();
      page.drawText(extractedText, { x: 50, y: 700, size: 12 });
      fs.writeFileSync(path.join(OUTPUT_DIR, `${fileId}.pdf`), await pdfDoc.save());

      const docx = new DocxDocument({ sections: [{ children: [new Paragraph(extractedText)] }] });
      fs.writeFileSync(path.join(OUTPUT_DIR, `${fileId}.docx`), await Packer.toBuffer(docx));

      fs.writeFileSync(path.join(OUTPUT_DIR, `${fileId}.txt`), extractedText);

      results.push({
        fileId,
        originalFilename: file.originalname,
        preview: extractedText.slice(0, 200) + '...',
        downloads: {
          text: `/api/ocr/download/${fileId}/text`,
          pdf: `/api/ocr/download/${fileId}/pdf`,
          docx: `/api/ocr/download/${fileId}/docx`
        }
      });
    } catch (err) {
      results.push({ error: `Failed: ${file.originalname}` });
    }
  }
  res.json({ results });
});

router.get('/download/:fileId/:type', auth, async (req, res) => {
  const { fileId, type } = req.params;
  const ext = type === 'text' ? 'txt' : type;
  const filepath = path.join(OUTPUT_DIR, `${fileId}.${ext}`);

  const doc = await Document.findOne({ fileId, user: req.user.id });
  if (!doc || !fs.existsSync(filepath)) return res.status(404).json({ message: 'Not found' });

  res.download(filepath, `${doc.originalFilename.split('.')[0]}.${ext}`);
});

router.get('/history', auth, async (req, res) => {
  const docs = await Document.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(20);
  res.json(docs.map(d => ({
    id: d._id,
    fileId: d.fileId,
    filename: d.originalFilename,
    uploadedAt: d.createdAt.toISOString(),
    preview: d.extractedText.slice(0, 100) + '...'
  })));
});

module.exports = router;
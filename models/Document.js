const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  originalFilename: { type: String, required: true },
  extractedText: { type: String, required: true },
  fileId: { type: String, required: true, unique: true },
}, { timestamps: true });

module.exports = mongoose.model('Document', documentSchema);
# OCR Platform - Backend (Node.js/Express)

**IMPORTANT: To test the backend, you MUST run the dummy OCR API first!**
## Features
- User registration & login with JWT authentication
- Secure, user-specific upload history
- Batch image upload
- Calls OCR API (dummy for testing, replace with real model later)
- Generates downloadable TXT , PDF , DOCX files
- MongoDB storage with Mongoose

## Tech Stack
- Node.js + Express
- MongoDB (via Mongoose)
- JWT for authentication
- Multer for file upload
- Axios + form-data for calling OCR API

## Prerequisites
- Node.js 
- MongoDB Atlas account (or local MongoDB)
- Python 3.10+ (for running the dummy OCR API)

## Setup Instructions

### 1. Clone the repository
```bash
git clone https://github.com/binaryblitz08/OCR_Platform.git

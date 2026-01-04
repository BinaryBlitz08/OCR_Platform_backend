"""
Run locally:
    pip install fastapi uvicorn python-multipart
    uvicorn dummy_api:app --reload --host 127.0.0.1 --port 8000
"""

from fastapi import FastAPI, UploadFile, File
from typing import List

app = FastAPI(title="BareBasic OCR API")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/ocr")
async def ocr_pages(files: List[UploadFile] = File(...)):
    """
    Accepts multiple files and returns:
    - structured OCR output per file
    - a concatenated text across all files
    """

    results = []
    concatenated_lines = []

    for idx, file in enumerate(files):
        # Placeholder OCR result (replace later with real inference)
        text = f"This is a stock response for {file.filename}"

        file_result = {
            "file_index": idx,
            "filename": file.filename,
            "text": text,
            "lines": [text],
        }

        results.append(file_result)
        concatenated_lines.append(text)

    return {
        "num_files": len(files),
        "results": results,
        "concatenated": {
            "text": "\n".join(concatenated_lines),
            "lines": concatenated_lines,
        },
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "dummy_api:app",
        host="127.0.0.1",
        port=8000,
        reload=False,
    )

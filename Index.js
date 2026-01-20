import express from "express";
import multer from "multer";
import mammoth from "mammoth";
import pdfjsLib from "pdfjs-dist/legacy/build/pdf.js";

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB safety limit
});

// ===== API KEY SETUP =====
const API_KEY = process.env.API_KEY;

function authenticate(req, res, next) {
  const apiKey = req.headers["x-api-key"];
  if (!API_KEY || apiKey !== API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// ===== HEALTH CHECK =====
app.get("/", (req, res) => {
  res.send("Text extractor running");
});

// ===== PDF EXTRACTOR =====
async function extractPDFText(buffer) {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
  });

  const pdf = await loadingTask.promise;
  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const texts = content.items.map((item) => item.str);
    fullText += texts.join(" ") + "\n";
  }

  return fullText;
}

// ===== MAIN ENDPOINT =====
app.post(
  "/extract",
  authenticate, // 🔐 API key protection
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { buffer, mimetype, originalname } = req.file;
      let text = "";

      // DOCX
      if (
        mimetype ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        originalname.toLowerCase().endsWith(".docx")
      ) {
        const result = await mammoth.extractRawText({ buffer });
        text = result.value;
      }

      // PDF
      else if (
        mimetype === "application/pdf" ||
        originalname.toLowerCase().endsWith(".pdf")
      ) {
        text = await extractPDFText(buffer);
      }

      // Unsupported
      else {
        return res.status(400).json({ error: "Unsupported file type" });
      }

      // Cleanup for AI
      text = text
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]+/g, " ")
        .trim();

      res.json({
        success: true,
        filename: originalname,
        characters: text.length,
        text,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Extraction failed" });
    }
  }
);

// ===== SERVER =====
app.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});
import { Router, Request } from "express";
import { requireAuth, AuthedRequest } from "../middleware/requireAuth.js";
import multer from "multer";
import path from "path";
import { promises as fs } from "fs";

interface MulterRequest extends AuthedRequest {
  file?: Express.Multer.File;
}

const router = Router();
router.use(requireAuth);

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(process.cwd(), "uploads");
fs.mkdir(uploadsDir, { recursive: true }).catch(() => {});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    cb(null, uploadsDir);
  },
  filename: (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit for better image support
    fieldSize: 50 * 1024 * 1024, // 50MB field size limit
  },
  fileFilter: (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    // Allow images and audio files
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and audio files are allowed'));
    }
  }
});

/**
 * POST /upload
 * Upload a file and return the file URL
 */
router.post("/upload", (req: MulterRequest, res) => {
  upload.single('file')(req, res, async (err) => {
    try {
      if (err) {
        console.error('Upload error:', err);
        
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: "File too large. Maximum size is 50MB." });
          }
          if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({ error: "Unexpected file field." });
          }
          return res.status(400).json({ error: `Upload error: ${err.message}` });
        }
        
        return res.status(400).json({ error: err.message || "Upload failed" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Validate file was actually saved
      try {
        await fs.access(req.file.path);
      } catch (accessError) {
        console.error('File not accessible after upload:', accessError);
        return res.status(500).json({ error: "File upload failed - file not saved" });
      }

      // Return the file URL that can be accessed via static file serving
      const fileUrl = `/uploads/${req.file.filename}`;
      
      console.log(`File uploaded successfully: ${req.file.filename} (${req.file.size} bytes)`);
      
      res.json({
        url: fileUrl,
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      });
    } catch (error: any) {
      console.error('Unexpected error in upload handler:', error);
      res.status(500).json({ error: error.message || "Upload failed" });
    }
  });
});

export default router;
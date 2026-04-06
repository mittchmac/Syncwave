import { Router, type IRouter } from "express";
import multer from "multer";
import { getRoom } from "../lib/rooms";
import { WebSocket } from "ws";

const router: IRouter = Router();
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

function send(ws: WebSocket, data: object) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

router.post("/rooms/:code/audio", upload.single("audio"), async (req, res): Promise<void> => {
  const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
  const room = getRoom(code);

  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: "No audio file uploaded" });
    return;
  }

  room.audioData = req.file.buffer;
  room.audioName = req.file.originalname;

  if (room.client) {
    send(room.client, { type: "audio-ready", audioName: room.audioName });
  }

  req.log.info({ code, filename: req.file.originalname, size: req.file.size }, "Audio uploaded to room");
  res.json({ success: true, audioName: room.audioName });
});

router.get("/rooms/:code/audio", async (req, res): Promise<void> => {
  const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
  const room = getRoom(code);

  if (!room || !room.audioData) {
    res.status(404).json({ error: "No audio found for room" });
    return;
  }

  res.set("Content-Type", "audio/mpeg");
  res.set("Content-Disposition", `inline; filename="${room.audioName ?? "audio.mp3"}"`);
  res.set("Content-Length", String(room.audioData.length));
  res.send(room.audioData);
});

export default router;

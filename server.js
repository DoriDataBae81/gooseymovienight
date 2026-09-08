const express = require('express');
const path = require('path');
const { randomUUID } = require('crypto');
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI environment variable. Set it before starting the server.');
  process.exit(1);
}

let videosCollection;

async function connectToDatabase(retriesLeft = 5) {
  const client = new MongoClient(MONGODB_URI, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true
    }
  });
  try {
    await client.connect();
    const db = client.db('goosey-movie-night');
    videosCollection = db.collection('videos');
    console.log('Connected to MongoDB');
  } catch (err) {
    if (retriesLeft > 0) {
      console.log(`MongoDB connection failed, retrying in 3s... (${retriesLeft} attempts left)`);
      await new Promise(r => setTimeout(r, 3000));
      return connectToDatabase(retriesLeft - 1);
    }
    throw err;
  }
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function extractYouTubeId(url) {
  const match = String(url).match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/);
  return match ? match[1] : null;
}

async function fetchYouTubeTitle(url) {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    if (!res.ok) return 'Untitled clip';
    const data = await res.json();
    return data.title || 'Untitled clip';
  } catch {
    return 'Untitled clip';
  }
}

app.use((req, res, next) => {
  if (req.path.startsWith('/api/') && !videosCollection) {
    return res.status(503).json({ error: 'Still connecting to the database, try again in a few seconds' });
  }
  next();
});

app.get('/api/videos', async (req, res) => {
  const videos = await videosCollection.find({}).toArray();
  videos.sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes));
  res.json(videos);
});

app.post('/api/videos', async (req, res) => {
  const { url } = req.body || {};
  if (!url) {
    return res.status(400).json({ error: 'url is required' });
  }

  const videoId = extractYouTubeId(url);
  if (!videoId) {
    return res.status(400).json({ error: 'Only YouTube links are supported right now' });
  }

  const title = await fetchYouTubeTitle(url);

  const video = {
    id: randomUUID(),
    title,
    originalUrl: url,
    embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1`,
    thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    submittedBy: null, // reserved for future Twitch login
    upvotes: 0,
    downvotes: 0,
    submittedAt: Date.now()
  };

  await videosCollection.insertOne(video);
  res.status(201).json(video);
});

app.post('/api/videos/:id/vote', async (req, res) => {
  const { direction } = req.body || {};
  const field = direction === 'down' ? 'downvotes' : 'upvotes';

  const result = await videosCollection.findOneAndUpdate(
    { id: req.params.id },
    { $inc: { [field]: 1 } },
    { returnDocument: 'after' }
  );

  if (!result) return res.status(404).json({ error: 'not found' });
  res.json(result);
});

function checkAdminPassword(req, res, next) {
  const provided = req.headers['x-admin-password'];
  if (!process.env.ADMIN_PASSWORD) {
    return res.status(500).json({ error: 'Admin password not configured on the server' });
  }
  if (provided !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Incorrect password' });
  }
  next();
}

app.post('/api/admin/verify', checkAdminPassword, (req, res) => {
  res.json({ ok: true });
});

app.delete('/api/videos/:id', checkAdminPassword, async (req, res) => {
  const result = await videosCollection.deleteOne({ id: req.params.id });
  if (result.deletedCount === 0) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// Start listening immediately so Render's port check succeeds right away.
app.listen(PORT, () => {
  console.log(`Video board running on http://localhost:${PORT}`);
});

// Connect to the database in the background; requests get a 503 until it's ready.
connectToDatabase().catch(err => {
  console.error('Failed to connect to MongoDB after retries:', err.message);
});

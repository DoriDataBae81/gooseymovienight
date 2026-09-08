const grid = document.getElementById('grid');
const toggleBtn = document.getElementById('submit-toggle');
const panel = document.getElementById('submit-panel');
const submitBtn = document.getElementById('submit-btn');
const urlInput = document.getElementById('url-input');
const adminDot = document.getElementById('admin-dot');

let adminPassword = sessionStorage.getItem('adminPassword') || null;

toggleBtn.addEventListener('click', () => panel.classList.toggle('hidden'));

adminDot.addEventListener('click', async () => {
  const attempt = prompt('Admin password:');
  if (!attempt) return;
  const res = await fetch('/api/admin/verify', {
    method: 'POST',
    headers: { 'x-admin-password': attempt }
  });
  if (res.ok) {
    adminPassword = attempt;
    sessionStorage.setItem('adminPassword', attempt);
    alert('Admin mode on. Delete buttons will appear on cards.');
    loadVideos();
  } else {
    alert('Wrong password.');
  }
});

async function loadVideos() {
  const res = await fetch('/api/videos');
  const videos = await res.json();
  grid.innerHTML = '';
  videos.forEach((video, index) => renderCard(video, index + 1));
}

function renderCard(video, rank) {
  const score = video.upvotes - video.downvotes;
  const totalVotes = video.upvotes + video.downvotes;

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="thumb-wrap">
      <div class="rank-badge">RANK ${String(rank).padStart(2, '0')}</div>
      ${adminPassword ? '<button class="delete-btn" title="Delete">&times;</button>' : ''}
      <img class="thumb" src="${video.thumbnailUrl}" alt="" loading="lazy" />
      <div class="play-btn">&#9658;</div>
    </div>
    <div class="card-body">
      <div class="title-row">
        <div class="card-title">${escapeHtml(video.title)}</div>
        <a class="external-link" href="${video.originalUrl}" target="_blank" rel="noopener">&#8599;</a>
      </div>
      <div class="meta-row">${video.submittedBy ? `submitted by ${escapeHtml(video.submittedBy)}` : 'submitted anonymously'}</div>
      <div class="vote-row">
        <div class="vote-score">
          <span class="score ${score < 0 ? 'negative' : ''}">${score > 0 ? '+' : ''}${score}</span>
          <span class="vote-total">${totalVotes} votes</span>
          <span class="vote-breakdown">${video.upvotes} up &middot; ${video.downvotes} down</span>
        </div>
        <div class="vote-buttons">
          <button class="vote-btn up" data-dir="up">&#128077;</button>
          <button class="vote-btn down" data-dir="down">&#128078;</button>
        </div>
      </div>
    </div>
  `;

  // Click thumbnail to swap in a playing embed
  const thumbWrap = card.querySelector('.thumb-wrap');
  thumbWrap.addEventListener('click', () => {
    thumbWrap.innerHTML = `<iframe src="${video.embedUrl}" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
  });

  const deleteBtn = card.querySelector('.delete-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Delete this video?')) return;
      const res = await fetch(`/api/videos/${video.id}`, {
        method: 'DELETE',
        headers: { 'x-admin-password': adminPassword }
      });
      if (res.ok) {
        loadVideos();
      } else {
        alert('Could not delete (wrong password saved?). Click the admin dot again to re-enter it.');
      }
    });
  }

  card.querySelectorAll('.vote-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const dir = btn.dataset.dir;
      await fetch(`/api/videos/${video.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction: dir })
      });
      loadVideos();
    });
  });

  grid.appendChild(card);
}

submitBtn.addEventListener('click', async () => {
  const url = urlInput.value.trim();
  if (!url) return;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Adding...';
  try {
    const res = await fetch('/api/videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || 'Could not add that video');
      return;
    }
    urlInput.value = '';
    panel.classList.add('hidden');
    loadVideos();
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit';
  }
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

loadVideos();

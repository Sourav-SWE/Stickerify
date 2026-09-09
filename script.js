// ===== State =====
const canvas = document.getElementById('stickerCanvas');
const ctx = canvas.getContext('2d');

let currentImage = null;      // the loaded HTMLImageElement
let selectedBorderColor = '#ffffff';
let armedTool = null;         // 'text' | 'emoji' | null
let armedEmoji = null;
let stickerCount = 0;

// photo adjustment state
let zoomLevel = 1;
let panOffsetX = 0;           // in source-image pixels
let panOffsetY = 0;
let imageLocked = false;      // true once a border/text/emoji has been baked in
let isDragging = false;
let dragMoved = false;
let dragStartX = 0, dragStartY = 0;
let dragStartPanX = 0, dragStartPanY = 0;
let lastSw = 0, lastSh = 0;   // source crop size from the most recent render, for pan math

// undo history: each entry snapshots the canvas + relevant state right
// before a border/text/emoji was added, so it can be popped off to remove
// just that last addition.
let historyStack = [];

// ===== Elements =====
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const browseBtn = document.getElementById('browseBtn');
const addBorderBtn = document.getElementById('addBorderBtn');
const borderSwatches = document.getElementById('borderSwatches');
const textInput = document.getElementById('textInput');
const armTextBtn = document.getElementById('armTextBtn');
const emojiRow = document.getElementById('emojiRow');
const resetBtn = document.getElementById('resetBtn');
const saveToSheetBtn = document.getElementById('saveToSheetBtn');
const downloadBtn = document.getElementById('downloadBtn');
const stickerSheet = document.getElementById('stickerSheet');
const emptyState = document.getElementById('emptyState');
const canvasHint = document.getElementById('canvasHint');
const zoomSlider = document.getElementById('zoomSlider');
const adjustRow = document.getElementById('adjustRow');
const undoBtn = document.getElementById('undoBtn');

// ===== Upload interactions (registered first, so a problem anywhere else
// in this file can never prevent choosing a photo from working) =====
function loadImageFile(file){
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      currentImage = img;
      zoomLevel = 1;
      panOffsetX = 0;
      panOffsetY = 0;
      imageLocked = false;
      if (zoomSlider) zoomSlider.value = 1;
      if (adjustRow) adjustRow.style.display = 'flex';
      canvas.classList.add('draggable');
      historyStack = [];
      updateUndoButton();
      renderImage();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

browseBtn.addEventListener('click', (e) => {
  e.stopPropagation(); // don't also trigger dropZone's own click handler below
  fileInput.click();
});
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
  loadImageFile(e.target.files[0]);
  fileInput.value = ''; // allow re-choosing the same file later
});

['dragenter','dragover'].forEach(evt =>
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  })
);
['dragleave','drop'].forEach(evt =>
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
  })
);
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  loadImageFile(file);
});

// ===== Helpers =====
function clearCanvas(){
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// Snapshot the canvas + adjustable-photo state before an edit (border/text/
// emoji) so that edit can be undone on its own later.
function pushHistory(){
  const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
  historyStack.push({
    imageData: snapshot,
    priorState: { imageLocked, zoomLevel, panOffsetX, panOffsetY }
  });
  updateUndoButton();
}

function updateUndoButton(){
  if (undoBtn) undoBtn.disabled = historyStack.length === 0;
}

if (undoBtn){
  undoBtn.addEventListener('click', () => {
    if (historyStack.length === 0) return;
    const entry = historyStack.pop();
    ctx.putImageData(entry.imageData, 0, 0);

    imageLocked = entry.priorState.imageLocked;
    zoomLevel = entry.priorState.zoomLevel;
    panOffsetX = entry.priorState.panOffsetX;
    panOffsetY = entry.priorState.panOffsetY;
    if (zoomSlider) zoomSlider.value = zoomLevel;

    if (currentImage && !imageLocked){
      if (adjustRow) adjustRow.style.display = 'flex';
      canvas.classList.add('draggable');
    } else {
      if (adjustRow) adjustRow.style.display = 'none';
      canvas.classList.remove('draggable');
    }
    updateUndoButton();
  });
}

// Renders currentImage into the canvas honoring zoomLevel + panOffset,
// so the person can reposition/zoom the photo before locking it in.
function renderImage(){
  if (!currentImage || imageLocked) return;
  const img = currentImage;
  const cw = canvas.width, ch = canvas.height;
  const ir = img.width / img.height;
  const cr = cw / ch;

  // base "cover" crop size (fills the canvas with no zoom)
  let baseSw, baseSh;
  if (ir > cr){ baseSh = img.height; baseSw = baseSh * cr; }
  else { baseSw = img.width; baseSh = baseSw / cr; }

  // zooming in means cropping a smaller source rectangle
  const sw = baseSw / zoomLevel;
  const sh = baseSh / zoomLevel;

  // clamp pan so we never crop outside the image bounds
  const maxPanX = (img.width - sw) / 2;
  const maxPanY = (img.height - sh) / 2;
  panOffsetX = Math.max(-maxPanX, Math.min(maxPanX, panOffsetX));
  panOffsetY = Math.max(-maxPanY, Math.min(maxPanY, panOffsetY));

  const sx = (img.width - sw) / 2 - panOffsetX;
  const sy = (img.height - sh) / 2 - panOffsetY;

  lastSw = sw; lastSh = sh;

  clearCanvas();
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
}

// ===== Drag to reposition photo =====
canvas.addEventListener('pointerdown', (e) => {
  if (!currentImage || imageLocked) return;
  isDragging = true;
  dragMoved = false;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  dragStartPanX = panOffsetX;
  dragStartPanY = panOffsetY;
  canvas.classList.add('dragging');
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  if (!isDragging) return;
  const rect = canvas.getBoundingClientRect();
  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;

  // convert CSS-pixel drag distance into source-image-pixel distance
  const sourcePerCssX = lastSw / rect.width;
  const sourcePerCssY = lastSh / rect.height;
  panOffsetX = dragStartPanX + dx * sourcePerCssX;
  panOffsetY = dragStartPanY + dy * sourcePerCssY;
  renderImage();
});

['pointerup','pointerleave','pointercancel'].forEach(evt =>
  canvas.addEventListener(evt, () => {
    isDragging = false;
    canvas.classList.remove('dragging');
  })
);

// ===== Zoom slider =====
zoomSlider.addEventListener('input', () => {
  if (!currentImage || imageLocked) return;
  zoomLevel = parseFloat(zoomSlider.value);
  renderImage();
});

// ===== Border color swatches =====
borderSwatches.addEventListener('click', (e) => {
  const btn = e.target.closest('.swatch');
  if (!btn) return;
  [...borderSwatches.children].forEach(c => c.classList.remove('selected'));
  btn.classList.add('selected');
  selectedBorderColor = btn.dataset.color;
});
borderSwatches.firstElementChild.classList.add('selected');

// ===== Sticker border effect =====
addBorderBtn.addEventListener('click', () => {
  if (!currentImage) {
    alert('Add a photo first, then give it a sticker border! 📸');
    return;
  }
  const cw = canvas.width, ch = canvas.height;
  const snapshot = ctx.getImageData(0, 0, cw, ch);

  // remember the pre-border state so it can be undone later
  historyStack.push({
    imageData: snapshot,
    priorState: { imageLocked, zoomLevel, panOffsetX, panOffsetY }
  });
  updateUndoButton();

  const inset = 18;      // how far the photo shrinks in
  const radius = 40;     // rounded corner radius

  // once the border is baked in, lock further photo repositioning
  imageLocked = true;
  canvas.classList.remove('draggable');
  adjustRow.style.display = 'none';

  clearCanvas();

  // draw the thick rounded border shape
  ctx.save();
  roundedRectPath(ctx, 0, 0, cw, ch, radius + 10);
  ctx.fillStyle = selectedBorderColor;
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 6;
  ctx.fill();
  ctx.restore();

  // draw the photo back on top, inset, clipped to rounded rect
  ctx.save();
  roundedRectPath(ctx, inset, inset, cw - inset * 2, ch - inset * 2, radius);
  ctx.clip();
  // put the original snapshot back, scaled slightly to fill the inset area
  const tmp = document.createElement('canvas');
  tmp.width = cw; tmp.height = ch;
  tmp.getContext('2d').putImageData(snapshot, 0, 0);
  ctx.drawImage(tmp, inset, inset, cw - inset * 2, ch - inset * 2);
  ctx.restore();
});

function roundedRectPath(context, x, y, w, h, r){
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

// ===== Text placement =====
armTextBtn.addEventListener('click', () => {
  if (!textInput.value.trim()) {
    textInput.focus();
    return;
  }
  armedTool = 'text';
  armedEmoji = null;
  [...emojiRow.children].forEach(c => c.classList.remove('selected'));
  canvasHint.textContent = 'Click anywhere on the canvas to drop your text ✍️';
});

// ===== Emoji placement =====
emojiRow.addEventListener('click', (e) => {
  const btn = e.target.closest('.emoji-btn');
  if (!btn) return;
  [...emojiRow.children].forEach(c => c.classList.remove('selected'));
  btn.classList.add('selected');
  armedTool = 'emoji';
  armedEmoji = btn.dataset.emoji;
  canvasHint.textContent = 'Click anywhere on the canvas to drop that emoji 🎯';
});

// ===== Canvas click to place text/emoji =====
canvas.addEventListener('click', (e) => {
  if (dragMoved) { dragMoved = false; return; } // this click was actually the end of a drag
  if (!armedTool) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  if (armedTool === 'text'){
    const label = textInput.value.trim();
    if (!label) return;
    pushHistory();
    ctx.font = "700 34px 'Baloo 2', sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeText(label, x, y);
    ctx.fillStyle = '#3A2E4D';
    ctx.fillText(label, x, y);
  } else if (armedTool === 'emoji'){
    pushHistory();
    ctx.font = '48px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(armedEmoji, x, y);
  }
});

// ===== Reset =====
resetBtn.addEventListener('click', () => {
  currentImage = null;
  armedTool = null;
  armedEmoji = null;
  zoomLevel = 1;
  panOffsetX = 0;
  panOffsetY = 0;
  imageLocked = false;
  zoomSlider.value = 1;
  adjustRow.style.display = 'none';
  canvas.classList.remove('draggable', 'dragging');
  textInput.value = '';
  historyStack = [];
  updateUndoButton();
  [...emojiRow.children].forEach(c => c.classList.remove('selected'));
  clearCanvas();
  canvasHint.textContent = 'Click the canvas to place text or emoji ✍️';
});

// ===== Save to sticker sheet =====
saveToSheetBtn.addEventListener('click', () => {
  if (!hasContent()) {
    alert('Your canvas is empty — add a photo first! 📸');
    return;
  }
  if (emptyState) emptyState.remove();

  const dataUrl = canvas.toDataURL('image/png');
  const item = document.createElement('div');
  item.className = 'sticker-item';
  const img = document.createElement('img');
  img.src = dataUrl;
  item.appendChild(img);
  stickerSheet.appendChild(item);
  stickerCount++;
});

function hasContent(){
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 0) return true; // any non-transparent pixel
  }
  return false;
}

// ===== Download =====
downloadBtn.addEventListener('click', () => {
  if (!hasContent()) {
    alert('Nothing to download yet — add a photo first! 📸');
    return;
  }
  const link = document.createElement('a');
  link.download = `sticker-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
});

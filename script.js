// ===== State =====
const canvas = document.getElementById('stickerCanvas');
const ctx = canvas.getContext('2d');

let currentImage = null;      // the loaded HTMLImageElement
let selectedBorderColor = '#ffffff';
let armedTool = null;         // 'text' | 'emoji' | null
let armedEmoji = null;
let stickerCount = 0;

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

// ===== Helpers =====
function clearCanvas(){
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawImageCover(img){
  clearCanvas();
  const cw = canvas.width, ch = canvas.height;
  const ir = img.width / img.height;
  const cr = cw / ch;
  let sx, sy, sw, sh;
  if (ir > cr){
    sh = img.height;
    sw = sh * cr;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = sw / cr;
    sx = 0;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
}

function loadImageFile(file){
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      currentImage = img;
      drawImageCover(img);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ===== Upload interactions =====
browseBtn.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => loadImageFile(e.target.files[0]));

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
  const file = e.dataTransfer.files[0];
  loadImageFile(file);
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

  const inset = 18;      // how far the photo shrinks in
  const radius = 40;     // rounded corner radius

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
  if (!armedTool) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  if (armedTool === 'text'){
    const label = textInput.value.trim();
    if (!label) return;
    ctx.font = "700 34px 'Baloo 2', sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeText(label, x, y);
    ctx.fillStyle = '#3A2E4D';
    ctx.fillText(label, x, y);
  } else if (armedTool === 'emoji'){
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
  textInput.value = '';
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

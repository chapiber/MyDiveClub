(function (global) {
  'use strict';

  const COLORS = ['#0d7ea8', '#1e8449', '#d68910', '#c0392b', '#8e44ad', '#16a085', '#2c3e50'];

  function drawBarChart(canvas, labels, values, title) {
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    const dpr = global.devicePixelRatio || 1;
    const w = canvas.clientWidth || 320;
    const h = 180;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = '#14212e';
    ctx.font = '600 14px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(title, 12, 20);

    const max = Math.max(...values, 1);
    const barW = Math.min(48, (w - 40) / Math.max(labels.length, 1) - 8);
    const baseY = h - 28;
    labels.forEach((label, i) => {
      const val = values[i];
      const barH = (val / max) * (h - 60);
      const x = 20 + i * (barW + 12);
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.fillRect(x, baseY - barH, barW, barH);
      ctx.fillStyle = '#14212e';
      ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(val), x + barW / 2, baseY - barH - 6);
      ctx.fillStyle = '#5a6d7d';
      ctx.font = '10px "Plus Jakarta Sans", sans-serif';
      const short = label.length > 8 ? label.slice(0, 7) + '…' : label;
      ctx.fillText(short, x + barW / 2, baseY + 14);
    });
    ctx.textAlign = 'left';
  }

  function drawPieChart(canvas, slices, title) {
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    const dpr = global.devicePixelRatio || 1;
    const w = canvas.clientWidth || 320;
    const h = 200;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = '#14212e';
    ctx.font = '600 14px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(title, 12, 20);

    const total = slices.reduce((s, x) => s + x.count, 0) || 1;
    const cx = w / 2;
    const cy = h / 2 + 10;
    const r = Math.min(w, h) / 2 - 36;
    let start = -Math.PI / 2;
    slices.forEach((slice, i) => {
      const angle = (slice.count / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, start + angle);
      ctx.closePath();
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.fill();
      start += angle;
    });

    let ly = 24;
    slices.forEach((slice, i) => {
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.fillRect(12, ly, 10, 10);
      ctx.fillStyle = '#5a6d7d';
      ctx.font = '11px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(`${slice.label} (${slice.count})`, 28, ly + 9);
      ly += 16;
    });
  }

  global.MaterielCharts = { drawBarChart, drawPieChart };
})(window);

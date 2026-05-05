const COLORS = [
  '#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF',
  '#FF6FB7', '#845EC2', '#FF9671', '#00C9A7',
  '#F9F871', '#FF8A5C', '#EA5455', '#2ECC71',
];

export function spawnConfetti(container: HTMLElement): void {
  const fragment = document.createDocumentFragment();
  const count = 80;

  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + '%';
    piece.style.top = -(Math.random() * 40 + 10) + 'px';
    piece.style.backgroundColor = COLORS[Math.floor(Math.random() * COLORS.length)];
    piece.style.width = Math.random() * 10 + 6 + 'px';
    piece.style.height = Math.random() * 10 + 6 + 'px';
    piece.style.animationDelay = Math.random() * 1.2 + 's';
    piece.style.animationDuration = Math.random() * 1.5 + 1.5 + 's';
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    fragment.appendChild(piece);
  }

  container.appendChild(fragment);
}

export function clearConfetti(container: HTMLElement): void {
  container.innerHTML = '';
}

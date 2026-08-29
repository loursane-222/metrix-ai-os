const app = document.querySelector('.app');
const params = new URLSearchParams(location.search);
const state = params.get('state') || 'plus';
app.dataset.state = ['plus', 'excel', 'error'].includes(state) ? state : 'plus';

document.querySelector('#plus').addEventListener('click', () => { app.dataset.state = 'plus'; });
document.querySelector('.excel-action').addEventListener('click', () => { app.dataset.state = 'domain'; });
document.querySelectorAll('.domains button').forEach((button) => button.addEventListener('click', () => {
  if (button.textContent.trim() === 'Müşteri') app.dataset.state = 'excel';
}));
document.querySelector('.cancel').addEventListener('click', () => { app.dataset.state = 'main'; });
document.querySelector('.domain-cancel').addEventListener('click', () => { app.dataset.state = 'main'; });
document.querySelector('.overlay').addEventListener('click', () => { app.dataset.state = 'main'; });
document.querySelector('.back').addEventListener('click', () => { app.dataset.state = 'main'; });
document.querySelector('#choose-file').addEventListener('click', () => {
  // Prototype safety: preserve native-file authority visually without opening
  // a picker or touching a real file/API during visual review.
});

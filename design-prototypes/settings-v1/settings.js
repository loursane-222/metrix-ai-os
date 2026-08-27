const account = document.querySelector('#account-view');
const logout = document.querySelector('#logout-view');
document.querySelector('[data-action="logout"]').addEventListener('click', () => {
  account.hidden = true; logout.hidden = false;
  document.querySelector('.content-head h1').textContent = 'Çıkış Yap';
  document.querySelector('.content-head .kicker').textContent = 'OTURUM';
  document.querySelectorAll('.rail-item').forEach((item) => item.classList.toggle('active', item.dataset.action === 'logout'));
});
document.querySelector('[data-action="cancel"]').addEventListener('click', showAccount);
document.querySelector('[data-action="account"]').addEventListener('click', showAccount);
function showAccount(){
  account.hidden = false; logout.hidden = true;
  document.querySelector('.content-head h1').textContent = 'Hesap Ayarları';
  document.querySelector('.content-head .kicker').textContent = 'KİŞİSEL PROFİL';
  document.querySelectorAll('.rail-item').forEach((item) => item.classList.toggle('active', item.dataset.action === 'account'));
}

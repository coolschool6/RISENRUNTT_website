const html = (signedIn, role) => signedIn
  ? `<a class="account-dashboard" href="${role === 'admin' ? '/admin' : '/profile'}">${role === 'admin' ? 'Admin' : 'My account'}</a><button class="account-logout" type="button">Log out</button>`
  : '<a class="account-login" href="/login">Log in</a><a class="account-signup" href="/signup">Sign up</a>';

export async function initAccountNavigation() {
  const host = document.querySelector('.header-actions');
  if (!host || host.querySelector('.account-actions')) return;
  const slot = document.createElement('div');
  slot.className = 'account-actions';
  slot.setAttribute('aria-label', 'Account actions');
  slot.innerHTML = html(false, null);
  host.prepend(slot);
  try {
    const response = await fetch('/api/auth/session', {credentials: 'same-origin'});
    const account = response.ok ? await response.json() : null;
    if (account?.authenticated) slot.innerHTML = html(true, account.role);
  } catch { /* Keep the sign-in links available if the status check is unavailable. */ }
  slot.querySelector('.account-logout')?.addEventListener('click', async () => {
    await fetch('/api/auth/logout', {method: 'POST', credentials: 'same-origin'});
    location.assign('/');
  });
}

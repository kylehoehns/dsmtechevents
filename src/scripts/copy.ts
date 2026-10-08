// Copy buttons (/organizers/). Without clipboard access, select
// the text on the page instead, so it can be copied by hand.
export async function copyText(text: string, shown: HTMLElement) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const range = document.createRange();
    range.selectNodeContents(shown);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);
    return false;
  }
}

// A button that copies `text()` and says so on itself for two seconds.
export function copyButton(button: HTMLButtonElement, text: () => string, shown: HTMLElement) {
  const label = button.textContent;
  let reset = 0;
  button.addEventListener('click', async () => {
    button.textContent = (await copyText(text(), shown)) ? 'Copied' : 'Selected';
    clearTimeout(reset);
    reset = window.setTimeout(() => { button.textContent = label; }, 2000);
  });
}

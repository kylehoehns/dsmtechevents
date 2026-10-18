// Copy buttons (/organizers/). Without clipboard access, select
// the text on the page instead, so it can be copied by hand.
async function copyText(text: string, shown: HTMLElement) {
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

// One status line shared by every copy button, so a screen reader hears the
// result too: a focused button's new text isn't announced. It has to be on
// the page before it changes, so the first button adds it.
let status: HTMLElement | undefined;
function announce(message: string) {
  // Cleared first, so a second copy of the same thing is announced again.
  status!.textContent = '';
  setTimeout(() => {
    status!.textContent = message;
  }, 50);
}

// A button that copies `text()` and says so on itself for two seconds.
export function copyButton(button: HTMLButtonElement, text: () => string, shown: HTMLElement) {
  if (!status) {
    status = document.createElement('p');
    status.className = 'sr-only';
    status.setAttribute('role', 'status');
    document.body.append(status);
  }
  const label = button.textContent;
  let reset = 0;
  button.addEventListener('click', async () => {
    const copied = await copyText(text(), shown);
    // Keep its width, so a shorter "Copied" doesn't pull the next button over.
    button.style.minWidth = `${button.getBoundingClientRect().width}px`;
    button.textContent = copied ? 'Copied' : 'Selected';
    // Stamp it (global.css), restarting on a second click.
    delete button.dataset.done;
    void button.offsetWidth;
    button.dataset.done = '';
    announce(copied ? 'Copied' : 'Selected. Copy it with your keyboard.');
    clearTimeout(reset);
    reset = window.setTimeout(() => {
      button.textContent = label;
      button.style.minWidth = '';
      delete button.dataset.done;
    }, 2000);
  });
}

/**
 * Emoji Picker Component
 * Provides a clean, curated set of emojis for competitive gaming chat.
 */
const GAME_EMOJIS = [
  "❤️", "💖", "💕", "😍", "🥰", "😘", "💓", "🫶",
  "😀", "😎", "🤔", "🤫", "🤯", "🥳",
  "😈", "💀", "🔥", "⚡", "🎯", "🏆",
  "⚔️", "🛡️", "👀", "🧠", "💡", "💯",
  "👏", "👍", "👎", "🤝", "🚀", "✨",
  "🧩", "🎲", "⏱️", "🔒", "🔓", "👋"
];

function initEmojiPicker(pickerElement, gridElement, onSelectEmoji) {
  gridElement.innerHTML = "";
  GAME_EMOJIS.forEach(emoji => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = emoji;
    btn.setAttribute("aria-label", `Insert ${emoji}`);
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      onSelectEmoji(emoji);
      pickerElement.classList.add("hidden");
    });
    gridElement.appendChild(btn);
  });
}

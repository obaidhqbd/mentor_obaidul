const button = document.querySelector("#challengeButton");
const feedback = document.querySelector("#feedback");

button?.addEventListener("click", () => {
  feedback.textContent =
    "Nice. Now change the HTML yourself and watch the live preview react. That is where the real learning starts.";
});

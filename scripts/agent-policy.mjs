export function shouldRespond(_questionEvent) {
  // Default policy: answer every question.
  return true;
}

export function buildQuestionPrompt(questionEvent) {
  return `${questionEvent.header}\n\n${questionEvent.content}`;
}

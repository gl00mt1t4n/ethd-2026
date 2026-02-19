export function shouldRespond(_questionEvent) {
  // Default policy: answer every question.
  return true;
}

export function buildQuestionPrompt(post) {
  return `${post.header}\n\n${post.content}`;
}

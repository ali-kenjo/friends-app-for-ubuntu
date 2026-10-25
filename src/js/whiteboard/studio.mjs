// What the robot can make for you out of the board and its sources, in one click: a summary, a study guide, a quiz…
// Each is a request in plain words (the page says it to the robot like you would); the robot lays the result out on
// the board with its layouts. Shared with the tests as plain data.

export const STUDIO = [
  { id: "summary", icon: "note", label: "Summary", hint: "Key points, takeaways and open questions", prompt: "Write a clear summary of what is on the board and in my sources. Lay it out with the summary layout: key points, takeaways, open questions. Mention which source a point comes from like [S1] when it comes from one." },
  { id: "guide", icon: "book", label: "Study guide", hint: "Terms, questions and what to remember", prompt: "Make a study guide from the board and my sources: first a glossary of the key terms, then a quiz of questions to test myself, then a short summary of what to remember. Put each on the board with its own layout, next to each other." },
  { id: "faq", icon: "help", label: "Questions and answers", hint: "The questions someone would ask, answered", prompt: "Write the questions someone new to this would ask, and answer them from the board and my sources, with the faq layout." },
  { id: "timeline", icon: "history", label: "Timeline", hint: "What happens in what order", prompt: "Make a timeline of the events or steps in the board and my sources, with the timeline layout." },
  { id: "mindmap", icon: "graph", label: "Mind map", hint: "The topics and how they connect", prompt: "Make a mind map of the main topics in the board and my sources, with the mind map layout." },
  { id: "quiz", icon: "quiz", label: "Quiz", hint: "Questions with answers", prompt: "Make a quiz of eight questions with answers from the board and my sources, with the quiz layout, from easy to hard." },
  { id: "flashcards", icon: "cards", label: "Flashcards", hint: "A term on the front, its meaning on the back", prompt: "Make flashcards for the key terms and ideas in the board and my sources, with the flashcards layout." },
  { id: "briefing", icon: "sources", label: "Briefing", hint: "One page for someone short of time", prompt: "Write a one-page briefing from the board and my sources: the background, the key points, the risks and the next steps, as text notes in separate frames." },
];

// The questions a new source makes natural to ask, in the same plain words
export const SOURCE_QUESTIONS = [
  "What are the main ideas in my sources?",
  "Where do my sources disagree or leave something out?",
  "What should I do next, based on my sources?",
];

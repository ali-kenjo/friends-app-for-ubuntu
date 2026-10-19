// Things to do together, so a long conversation never runs dry: games,
// debates, stories, practice. Shown as chips in the chat and in voice mode
// ("Let's do something"), and the AI knows them too, to suggest one when the
// conversation stalls. Each prompt is what you'd say to start it.
const ACTIVITIES = [
  { id: "debate", icon: "bolt", title: "Debate", prompt: "Let's have a friendly debate. Pick a fun, slightly controversial topic, tell me which side you're on, and I'll take the other. Keep your arguments short and punchy." },
  { id: "would-you-rather", icon: "dice", title: "Would you rather", prompt: "Let's play Would You Rather. You ask first, then explain your own pick after I answer, then it's my turn." },
  { id: "story", icon: "book", title: "Build a story", prompt: "Let's build a story together, taking turns. You start with an intriguing opening of two or three sentences, then I continue." },
  { id: "quiz", icon: "target", title: "Quiz me", prompt: "Quiz me! Ask me one trivia question at a time on a mix of topics, keep score, and make it harder when I get them right." },
  { id: "hot-takes", icon: "flame", title: "Hot takes", prompt: "Rapid-fire hot takes: give me a topic, I give my opinion in one sentence, then you give yours. Keep it fast and fun." },
  { id: "two-truths", icon: "eye", title: "Two truths and a lie", prompt: "Let's play Two Truths and a Lie. You go first with three surprising 'facts' about the world, and I'll guess the lie." },
  { id: "twenty-questions", icon: "info", title: "20 questions", prompt: "Let's play 20 Questions. Think of something and I'll ask yes-or-no questions to guess it. Count my questions." },
  { id: "deep-question", icon: "moon", title: "Deep question", prompt: "Ask me a deep, interesting question, the kind that makes for a real conversation, then share your own answer after mine." },
  { id: "roleplay", icon: "smile", title: "Role-play a scene", prompt: "Let's role-play a scene. Suggest three fun or useful scenarios (for example a job interview, a negotiation, or ordering at a café in Germany), I'll pick one, and you set the scene." },
  { id: "german", icon: "globe", title: "Practice German", prompt: "Let's practice German. Talk with me in simple German about everyday things, and gently correct my mistakes after I answer." },
  { id: "english", icon: "globe", title: "Practice English", prompt: "Let's practice English conversation. Chat with me naturally and point out one or two things I could say more naturally after each answer." },
  { id: "content-ideas", icon: "video", title: "Content ideas", prompt: "Let's brainstorm video ideas. Pitch me five ideas with a strong hook each, for short-form and long-form, then help me pick the best one." },
  { id: "riddle", icon: "puzzle", title: "Riddles", prompt: "Give me a riddle. Give hints if I get stuck, and keep track of how many I solve." },
  { id: "recommend", icon: "heart", title: "Recommendation duel", prompt: "Recommendation duel: we take turns recommending a movie, series, song or book to each other, and explain why in one sentence." },
  { id: "plan-day", icon: "calendar", title: "Plan my day", prompt: "Help me plan my day: look at what's on today (tasks, reminders, calendar, habits), suggest a realistic order with times, and add anything we decide as tasks or reminders." },
  { id: "my-day", icon: "sun", title: "Talk about my day", prompt: "Ask me about my day, really listen, and help me find the best moment in it." },
  { id: "surprise", icon: "dice", title: "Surprise me", prompt: "Surprise me: pick something fun for us to do or talk about right now, something we haven't done before." },
];

module.exports = { ACTIVITIES };

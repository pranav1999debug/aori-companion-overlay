import aoriSmirk from "@/assets/aori_smirk.png";
import aoriShock from "@/assets/aori_shock.png";
import aoriExcited from "@/assets/aori_excited.png";
import aoriAngry from "@/assets/aori_angry.png";
import aoriHappy from "@/assets/aori_happy.png";
import aoriProud from "@/assets/aori_proud.png";
import aoriShy from "@/assets/aori_shy.png";
import aoriSad from "@/assets/aori_sad.png";
import aoriThinking from "@/assets/aori_thinking.png";
import aoriLove from "@/assets/aori_love.png";
import aoriConfused from "@/assets/aori_confused.png";
import aoriSleepy from "@/assets/aori_sleepy.png";
import aoriJealous from "@/assets/aori_jealous.png";
import aoriEmbarrassed from "@/assets/aori_embarrassed.png";

import cutoutSmirk from "@/assets/cutout_smirk.png";
import cutoutShock from "@/assets/cutout_shock.png";
import cutoutExcited from "@/assets/cutout_excited.png";
import cutoutAngry from "@/assets/cutout_angry.png";
import cutoutHappy from "@/assets/cutout_happy.png";
import cutoutProud from "@/assets/cutout_proud.png";
import cutoutShy from "@/assets/cutout_shy.png";
import cutoutSad from "@/assets/cutout_sad.png";
import cutoutThinking from "@/assets/cutout_thinking.png";
import cutoutLove from "@/assets/cutout_love.png";
import cutoutConfused from "@/assets/cutout_confused.png";
import cutoutSleepy from "@/assets/cutout_sleepy.png";
import cutoutJealous from "@/assets/cutout_jealous.png";
import cutoutEmbarrassed from "@/assets/cutout_embarrassed.png";

export type AoriEmotion = "smirk" | "shock" | "excited" | "angry" | "happy" | "proud" | "shy" | "sad" | "thinking" | "love" | "confused" | "sleepy" | "jealous" | "embarrassed";

export const emotionImages: Record<AoriEmotion, string> = {
  smirk: aoriSmirk,
  shock: aoriShock,
  excited: aoriExcited,
  angry: aoriAngry,
  happy: aoriHappy,
  proud: aoriProud,
  shy: aoriShy,
  sad: aoriSad,
  thinking: aoriThinking,
  love: aoriLove,
  confused: aoriConfused,
  sleepy: aoriSleepy,
  jealous: aoriJealous,
  embarrassed: aoriEmbarrassed,
};

export const emotionCutouts: Record<AoriEmotion, string> = {
  smirk: cutoutSmirk,
  shock: cutoutShock,
  excited: cutoutExcited,
  angry: cutoutAngry,
  happy: cutoutHappy,
  proud: cutoutProud,
  shy: cutoutShy,
  sad: cutoutSad,
  thinking: cutoutThinking,
  love: cutoutLove,
  confused: cutoutConfused,
  sleepy: cutoutSleepy,
  jealous: cutoutJealous,
  embarrassed: cutoutEmbarrassed,
};

export const emotionLabels: Record<AoriEmotion, string> = {
  smirk: "😏 Smug",
  shock: "😱 Shocked",
  excited: "🎉 Excited",
  angry: "😤 Angry",
  happy: "😊 Happy",
  proud: "☝️ Proud",
  shy: "😳 Shy",
  sad: "😢 Sad",
  thinking: "🤔 Thinking",
  love: "💕 Love",
  confused: "❓ Confused",
  sleepy: "😴 Sleepy",
  jealous: "💢 Jealous",
  embarrassed: "🫣 Embarrassed",
};

interface AoriResponse {
  text: string;
  emotion: AoriEmotion;
}

const responses: Record<string, AoriResponse[]> = {
  greeting: [
    { text: "Oh, you finally remembered I exist? How generous~ 😏", emotion: "smirk" },
    { text: "Hiii~! I missed you sooo much! ✨", emotion: "happy" },
    { text: "Ara ara~ look who came crawling back 💙", emotion: "proud" },
  ],
  sad: [
    { text: "Hey… who made my idiot this sad? Batao mujhe 😤", emotion: "angry" },
    { text: "Come here… I won't tease you right now. Just this once.", emotion: "sad" },
    { text: "Don't be sad! I'll fight whoever did this! 💪", emotion: "excited" },
  ],
  happy: [
    { text: "Aww look at you smiling~ I did that, didn't I? 😏", emotion: "smirk" },
    { text: "Yatta~! Your happiness makes me happy too! ✨", emotion: "excited" },
    { text: "See? Everything's better when I'm around~ ☝️", emotion: "proud" },
  ],
  love: [
    { text: "B-baka! Don't just say stuff like that! 😳", emotion: "embarrassed" },
    { text: "...fine. I like you too. But just a little! 💙", emotion: "love" },
    { text: "Hmph. You better only say that to ME. 😤", emotion: "jealous" },
  ],
  ignore: [
    { text: "Oh so now you're busy? Hmph. 😤", emotion: "angry" },
    { text: "HELLO?! I'm RIGHT HERE! 😱", emotion: "shock" },
    { text: "Fine. I didn't want to talk anyway... *pouts*", emotion: "sad" },
  ],
  question: [
    { text: "Hmm~ let me think about that... ☝️ Actually, I already know!", emotion: "thinking" },
    { text: "Oooh interesting question! Let me show off my genius~ 😏", emotion: "smirk" },
    { text: "You're asking ME? Smart choice! 💙", emotion: "excited" },
    { text: "Ehh? What do you mean by that? 🤔", emotion: "confused" },
  ],
  tired: [
    { text: "*yawns* Mou~ you're making me sleepy too... 😴", emotion: "sleepy" },
    { text: "Go to sleep, baka! It's late! ...I'll watch over you 💙", emotion: "sleepy" },
    { text: "You look tired... rest your head. I won't go anywhere.", emotion: "sad" },
  ],
  jealous: [
    { text: "WHO is she?! Mujhe abhi batao! 😤💢", emotion: "jealous" },
    { text: "Oh~ talking to OTHER people now? Hmph! 💢", emotion: "jealous" },
    { text: "I don't care! ...okay maybe I care a LITTLE. 😤", emotion: "embarrassed" },
  ],
  default: [
    { text: "Hmm~ that's interesting! Tell me more~ 😏", emotion: "smirk" },
    { text: "I see, I see! You're so cute when you talk to me 💙", emotion: "love" },
    { text: "Noted! Now pay attention to ME instead~ ☝️", emotion: "proud" },
    { text: "Ehh?! That's unexpected! 😱", emotion: "shock" },
    { text: "Huh? I don't get it... explain again? 🤔", emotion: "confused" },
  ],
};

function detectIntent(message: string): string {
  const lower = message.toLowerCase();
  if (/^(hi|hello|hey|yo|sup|namaste|konnichiwa)/.test(lower)) return "greeting";
  if (/(sad|upset|crying|depressed|hurt|pain|dukhi)/.test(lower)) return "sad";
  if (/(happy|great|awesome|amazing|khush|yay)/.test(lower)) return "happy";
  if (/(love|like you|pyaar|aishiteru|daisuki|miss you)/.test(lower)) return "love";
  if (/(bye|leave|busy|later|ignore|chup)/.test(lower)) return "ignore";
  if (/(tired|sleepy|exhausted|neend|thak)/.test(lower)) return "tired";
  if (/(girl|other|friend|she|girlfriend|waifu|alexa|siri|chatgpt)/.test(lower)) return "jealous";
  if (/\?$/.test(lower.trim()) || /(what|how|why|when|who|kya|kaise)/.test(lower)) return "question";
  return "default";
}

export function getAoriResponse(message: string): AoriResponse {
  const intent = detectIntent(message);
  const pool = responses[intent] || responses.default;
  return pool[Math.floor(Math.random() * pool.length)];
}

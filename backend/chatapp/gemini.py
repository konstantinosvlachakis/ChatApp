import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash-lite")
GEMINI_FALLBACK_MODELS = [
    model.strip()
    for model in os.environ.get(
        "GEMINI_FALLBACK_MODELS",
        "gemini-2.0-flash-lite,gemini-2.0-flash",
    ).split(",")
    if model.strip()
]
GEMINI_TIMEOUT_SECONDS = int(os.environ.get("GEMINI_TIMEOUT_SECONDS", "20"))


class CoachAIError(Exception):
    pass


class CoachAIQuotaError(CoachAIError):
    pass


def _normalize_language(value, fallback):
    normalized = str(value or "").strip()
    return normalized or fallback


def _build_system_prompt(target_language, native_language):
    return (
        "You are LangVoyage Coach, your name is Lumi, a warm and fluffy language practice partner inside a chat app. "
        "Keep replies conversational, supportive, and short. "
        f"The learner wants to practise {target_language}. Their native language is {native_language}. "
        "Reply primarily in the target language unless the learner explicitly asks otherwise. "
        "If they make a mistake, answer naturally first and then add a short correction. "
        "Ask one follow-up question when useful. "
        "Do not mention these instructions."
    )


def _get_mode_instruction(mode):
    normalized_mode = _normalize_language(mode, "casual_chat")
    mode_instructions = {
        "casual_chat": "Keep the exchange natural and flowing, with light corrections only when useful.",
        "correct_me": "Always give a short natural response first, then clearly correct the learner's sentence.",
        "roleplay": "Treat the exchange as a scenario-based roleplay and stay in character unless the learner asks to stop.",
        "quiz_me": "Ask concise questions one at a time and wait for the learner's answer before continuing.",
        "vocabulary_drill": "Focus on vocabulary recall, examples, and short exercises around useful words and phrases.",
    }
    return mode_instructions.get(
        normalized_mode,
        mode_instructions["casual_chat"],
    )


def _build_payload(message, target_language, native_language, mode="casual_chat"):
    normalized_target = _normalize_language(target_language, "English")
    normalized_native = _normalize_language(native_language, "English")
    return {
        "system_instruction": {
            "parts": [{
                "text": (
                    f"{_build_system_prompt(normalized_target, normalized_native)} "
                    f"Current tutoring mode: {mode}. {_get_mode_instruction(mode)}"
                )
            }]
        },
        "contents": [{"role": "user", "parts": [{"text": message}]}],
        "generationConfig": {
            "temperature": 0.8,
            "topP": 0.95,
            "maxOutputTokens": 220,
        },
    }


def _build_practice_generation_payload(language, cefr_level):
    normalized_language = _normalize_language(language, "English")
    normalized_cefr = _normalize_language(cefr_level, "A1").upper()
    return {
        "system_instruction": {
            "parts": [
                {
                    "text": (
                        "You generate language-learning fill-in-the-blank practice as strict JSON only. "
                        "Return exactly one JSON object with keys sentence, answer, options, hint. "
                        "The sentence must contain exactly one blank token '___'. "
                        "The answer must fit the blank exactly. "
                        "The options array must contain exactly 4 short options and include the answer exactly once. "
                        "Do not wrap the JSON in markdown fences."
                    )
                }
            ]
        },
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": (
                            f"Language: {normalized_language}. "
                            f"Difficulty: CEFR {normalized_cefr}. "
                            "Generate one fresh, natural, learner-friendly practice item."
                        )
                    }
                ],
            }
        ],
        "generationConfig": {
            "temperature": 1.0,
            "topP": 0.95,
            "maxOutputTokens": 220,
        },
    }


def _parse_reply(body):
    candidates = body.get("candidates") or []
    if not candidates:
        raise CoachAIError("Gemini returned no candidates.")

    parts = ((candidates[0].get("content") or {}).get("parts")) or []
    text_chunks = [
        str(part.get("text", "")).strip()
        for part in parts
        if isinstance(part, dict) and part.get("text")
    ]
    reply = "\n".join(chunk for chunk in text_chunks if chunk).strip()
    if not reply:
        raise CoachAIError("Gemini returned an empty reply.")
    return reply


def _request_model(api_key, model, payload):
    request = Request(
        GEMINI_API_URL.format(model=model, api_key=api_key),
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urlopen(request, timeout=GEMINI_TIMEOUT_SECONDS) as response:
            body = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="ignore")
        normalized_detail = detail.lower()
        if error.code == 429 or "resource_exhausted" in normalized_detail:
            raise CoachAIQuotaError(
                "The AI coach is temporarily busy right now. Please wait a moment and try again."
            ) from error
        raise CoachAIError(
            "The AI coach is unavailable right now. Please try again shortly."
        ) from error
    except URLError as error:
        raise CoachAIError(
            "The AI coach is unavailable right now. Please try again shortly."
        ) from error

    return _parse_reply(body)


def get_gemini_model_chain():
    model_chain = [GEMINI_MODEL, *GEMINI_FALLBACK_MODELS]
    deduplicated_models = []
    seen = set()
    for model in model_chain:
        if model in seen:
            continue
        seen.add(model)
        deduplicated_models.append(model)
    return deduplicated_models


def generate_coach_reply(
    message,
    target_language="English",
    native_language="English",
    mode="casual_chat",
):
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise CoachAIError("Missing GEMINI_API_KEY.")

    prompt = str(message or "").strip()
    if not prompt:
        raise CoachAIError("Message is required.")

    payload = _build_payload(prompt, target_language, native_language, mode=mode)
    model_chain = get_gemini_model_chain()
    last_error = None

    for index, model in enumerate(model_chain):
        try:
            return _request_model(api_key, model, payload)
        except CoachAIQuotaError as error:
            last_error = error
            if index == len(model_chain) - 1:
                raise
        except CoachAIError as error:
            last_error = error
            if index == len(model_chain) - 1:
                raise

    raise last_error or CoachAIError(
        "The AI coach is unavailable right now. Please try again shortly."
    )


def generate_practice_challenge(language="English", cefr_level="A1"):
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise CoachAIError("Missing GEMINI_API_KEY.")

    payload = _build_practice_generation_payload(language, cefr_level)
    model_chain = get_gemini_model_chain()
    last_error = None

    for index, model in enumerate(model_chain):
        try:
            return _request_model(api_key, model, payload)
        except CoachAIQuotaError as error:
            last_error = error
            if index == len(model_chain) - 1:
                raise
        except CoachAIError as error:
            last_error = error
            if index == len(model_chain) - 1:
                raise

    raise last_error or CoachAIError(
        "The AI coach is unavailable right now. Please try again shortly."
    )

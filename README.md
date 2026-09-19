# AccessBridge – AI Accommodations Concierge

An AI-powered accommodations assistant for students with disabilities, with lecture transcription, profile-specific study material, text-to-speech read-aloud, and AI-drafted accommodation request emails.

## Quick Start

### Setup
1. Install dependencies

npm install

2. Copy the environment template

cp .env.example .env.local

3. Add your API keys to .env.local
See "API Key Setup" below for where to get each one
4. Run database migrations
See supabase/ folder — run each .sql file in the Supabase SQL Editor
in order
5. Start the dev server

npm run dev


## Features

* **Lecture Upload & Live Recording** — upload an audio file or record a lecture directly in the browser
* **Transcription with Timestamps** — powered by Gemini, with a model fallback chain for reliability
* **Profile-Specific Study Material** — chunked summaries, glossaries, and outlines for dyslexia; captioned transcripts and a fully text-based concept map for deaf/hard-of-hearing students
* **Accommodation Request Agent** — drafts a real, specific accommodation email grounded in the actual lecture content, which the student reviews, edits, and sends
* **Read-Aloud** — text-to-speech via ElevenLabs, with cached audio so repeat plays don't regenerate
* **Context-Aware Chatbot** — answers questions grounded in lecture content on a lecture page, and general site-navigation help elsewhere
* **Dyslexia-Friendly Reading Mode** — a persistent, visible toggle that changes font and spacing
* **Multi-Language Interface** — English, Spanish, French, and Portuguese
* **Accessible by Design** — keyboard operable throughout, visible focus states, no color-only status indicators, live-region announcements on status changes

## Installation

### Option 1: Standard Setup
Clone the repository

git clone https://github.com/<your-username>/AccessBridge.git
cd AccessBridge

Install dependencies

npm install

Create environment file

cp .env.example .env.local

Edit .env.local and add your API keys (see below)
Run Supabase migrations from the supabase/ folder in the SQL Editor
Start the dev server

npm run dev


## API Key Setup

This project uses five external services. Each needs its own API key.

### Supabase (Database, Auth, Storage)
1. Visit: https://supabase.com
2. Create a new project
3. Go to **Project Settings → API** for your Project URL and anon/public key

### Google Gemini (Transcription, study material, chatbot, email drafting)
1. Visit: https://aistudio.google.com
2. Click "Get API key" → "Create API key"

### ElevenLabs (Read-aloud text-to-speech)
1. Visit: https://elevenlabs.io
2. Go to Profile → API Keys → generate a key
3. Scope the key to **Text to Speech** access only

### Resend (Accommodation email sending)
1. Visit: https://resend.com
2. Go to API Keys → Create API Key
3. Verify a sending domain so delivery to .edu addresses works reliably

### Configure Environment
Edit .env.local

SUPABASE_URL=your-project-url
SUPABASE_ANON_KEY=your-anon-key
GEMINI_API_KEY=your-gemini-key
ELEVENLABS_API_KEY=your-elevenlabs-key
RESEND_API_KEY=your-resend-key
EMAIL_FROM=requests@yourdomain.com


## Architecture

**Frontend:**
* Next.js 14 (App Router), TypeScript, Tailwind CSS
* A custom design system ("Warm Clarity") — deliberate color, type, and spacing tokens built for readability and accessibility

**Backend:**
* Next.js API routes
* Supabase (Postgres, Auth, Storage)
* Google Gemini API (transcription, generation, chat, email drafting)
* ElevenLabs API (text-to-speech)
* Resend API (transactional email)

### AI Processing Pipeline

Lecture Audio → Gemini Transcription → Profile-Specific Study Material
↓
Accommodation Email Draft (grounded in transcript)
↓
Student Review/Edit → Resend → Professor Inbox


## Deployment

### Production
1. Set all environment variables in your hosting platform (this project is deployed on Vercel)
2. Run all Supabase migrations against your production database
3. Verify your Resend sending domain so accommodation emails deliver reliably
4. Confirm your Supabase Auth redirect URL allowlist includes your production domain

## Troubleshooting

### API Key Not Working
* Double-check you copied the full key with no extra whitespace
* Confirm the key has the right scope/permissions (e.g. Text to Speech access for ElevenLabs)
* Check billing/quota status on the relevant provider's dashboard

### Emails Not Delivering
* Confirm `EMAIL_FROM` is set to an address on a verified Resend domain — unverified sending will silently fail for many recipients, especially .edu addresses

### Sign-In Not Working on a Custom Domain
* Check Supabase → Authentication → URL Configuration and confirm your domain is in the allowed redirect URLs

### Gemini Errors / Rate Limiting
* The free tier has a low daily request cap per model; this project includes a model fallback chain, but enabling billing on the Gemini API key is recommended for reliable use

### Server Won't Start
* Run `npm install` to ensure dependencies are current
* Confirm `.env.local` exists and all required keys are set
* Confirm Supabase migrations have been run

## License

This project is open source and available under the MIT License.

## Contributing

Feel free to submit issues, feature requests, or pull requests to improve this application.

## Acknowledgments

* Google Gemini for transcription, generation, and conversational AI
* ElevenLabs for text-to-speech
* Resend for transactional email
* Supabase for database, auth, and storage
* Next.js and Vercel for the application framework and deployment

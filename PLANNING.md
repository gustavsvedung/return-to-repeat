# Return to Repeat — Planning Document  
  
## Overview  
  
An audio player that feels alive. It knows things about the listener — time, season, listening history — and responds accordingly. The listener doesn't control everything; the album reveals itself on its own terms.  
⸻  
## Available Signals (No Permission Required)  
  
These can be used to select track variations silently:  

| Signal | Examples | Notes |
| ---------------------- | ---------------------------------------------------------------- | ------------------------------- |
| Time of day | Morning (6-12), Afternoon (12-17), Evening (17-21), Night (21-6) | Define your own brackets |
| Day of week | Monday, Saturday, Weekend vs weekday |  |
| Date | First of month, specific date, day of year |  |
| Season / Month | Winter (Dec-Feb), Summer, "July-August" |  |
| Moon phase | Full moon, new moon, waxing/waning | Calculable from date |
| Dark mode | User's system preference | prefers-color-scheme |
| Timezone region | Europe, Americas, Asia/Pacific | From Intl.DateTimeFormat |
| Language/Locale | Swedish vs international | navigator.language |
| Sunrise/Sunset | Is it light or dark outside? | Calculable from date + timezone |
| Visit count | First visit, 5th visit, etc. | localStorage |
| Track play count | Times this specific track was played | localStorage |
| Album completion count | Full album listens (1 min+ per track) | localStorage |
| Session duration | How long they've been listening | Track in JS |
| Previous track | What they just listened to | Affects transitions |
| Playback mode | Sequential vs shuffle |  |
| Days since release | Week 1, Month 1, "anniversary" | Calculate from release date |
| Device type | Mobile vs desktop | Screen size / touch capability |
  
⸻  
## Track Planning  
  
Fill in your creative intentions for each track:  
  
**Track 1: one**  

| Aspect | Decision |
| ------------- | -------------------------------------------------------------------------- |
| Type | ☒ Standard ☐ Random variations ☐ Contextual ☐ Interactive (stems) ☐ Locked |
| Variations |  |
| Trigger logic |  |
| Notes |  |
  
⸻  
**Track 2: two**  

| Aspect | Decision |
| ------------- | -------------------------------------------------------------------------- |
| Type | ☒ Standard ☐ Random variations ☐ Contextual ☐ Interactive (stems) ☐ Locked |
| Variations |  |
| Trigger logic |  |
| Notes |  |
  
⸻  
**Track 3: three**  

| Aspect | Decision |
| ------------- | -------------------------------------------------------------------------- |
| Type | ☐ Standard ☐ Random variations ☒ Contextual ☒ Interactive (stems) ☐ Locked |
| Variations | A, B |
| Trigger logic | Time of day |
| Notes | Four buttons for muting and unmuting vocal tracks |
  
⸻  
**Track 4: four**  

| Aspect | Decision |
| ------------- | -------------------------------------------------------------------------- |
| Type | ☐ Standard ☒ Random variations ☒ Contextual ☒ Interactive (stems) ☐ Locked |
| Variations | A1, A2, A3, B |
| Trigger logic | B plays on Sundays only |
| Notes | A1-3 has an unmute button for a drum track |
  
⸻  
**Track 5: five**  

| Aspect | Decision |
| ------------- | -------------------------------------------------------------------------- |
| Type | ☐ Standard ☒ Random variations ☐ Contextual ☒ Interactive (stems) ☐ Locked |
| Variations | A, B |
| Trigger logic | B has a 17% chance of being selected |
| Notes | Five buttons for playing synth notes |
  
⸻  
**Track 6: six**  

| Aspect | Decision |
| ------------- | -------------------------------------------------------------------------- |
| Type | ☐ Standard ☐ Random variations ☐ Contextual ☒ Interactive (stems) ☐ Locked |
| Variations |  |
| Trigger logic |  |
| Notes | Mute button for the whistling track |
  
⸻  
**Track 7: seven**  

| Aspect | Decision |
| ------------- | -------------------------------------------------------------------------- |
| Type | ☐ Standard ☐ Random variations ☒ Contextual ☒ Interactive (stems) ☐ Locked |
| Variations | A, B |
| Trigger logic | B plays on full moon |
| Notes | B has three faders for drone tracks |
  
⸻  
**Track 8: eight**  

| Aspect | Decision |
| ------------- | -------------------------------------------------------------------------- |
| Type | ☐ Standard ☒ Random variations ☐ Contextual ☐ Interactive (stems) ☐ Locked |
| Variations | A, B, C |
| Trigger logic | 33% chance of loading A,B or C |
| Notes |  |
  
⸻  
**Track 9: nine**  

| Aspect | Decision |
| ------------- | -------------------------------------------------------------------------- |
| Type | ☐ Standard ☒ Random variations ☒ Contextual ☒ Interactive (stems) ☐ Locked |
| Variations | A1, A2, A3, B1, B2, B3 |
| Trigger logic | Odd or even date (A or B), random track version load (1-3) |
| Notes | A has a three state button for altering keyboard tracks. |
  
⸻  
**Track 10: ten**  

| Aspect | Decision |
| ------------- | -------------------------------------------------------------------------- |
| Type | ☐ Standard ☐ Random variations ☒ Contextual ☐ Interactive (stems) ☐ Locked |
| Variations | A, B |
| Trigger logic | Track play count (change A-B on every ten times track is played) |
| Notes |  |
  
⸻  
**Track 11: eleven**  

| Aspect | Decision |
| ------------- | -------------------------------------------------------------------------- |
| Type | ☐ Standard ☐ Random variations ☐ Contextual ☐ Interactive (stems) ☒ Locked |
| Variations |  |
| Trigger logic | Hidden until album is played through five times |
| Notes |  |
  
⸻  
## Locked Content Rules  
  
Define any tracks or content that requires unlocking:  

| Content  | Unlock Condition     | What User Sees When Locked |
| -------- | -------------------- | -------------------------- |
| Track 11 | 5 full album listens | ”Hidden”                   |
  
  
**"Full album listen" definition:**  
- Minimum time per track: 60 seconds  
- Must be in order: ☐ Yes ☒ No  
- Within same session: ☐ Yes ☒ No (cumulative across visits)  
⸻  
## Interactive Track Details  
  
For tracks with stem toggling:  
  
**Track 3: three**  

| Stem | Description | Default State | Notes |
| -------------------------- | ----------- | ------------- | ----------------- |
| 03A.mp3 or 03B.mp3 | Main mix | Always on | Cannot be toggled |
| 03Avoc1.mp3 or 03Bvoc1.mp3 | Voc 1 | ☒ On ☐ Off | Mute button |
| 03Avoc2.mp3 or 03Bvoc2.mp3 | Voc 2 | ☐ On ☒ Off | Mute button |
| 03Avoc3.mp3 or 03Bvoc3.mp3 | Voc 3 | ☐ On ☒ Off | Mute button |
| 03Avoc3.mp3 or 03Bvoc3.mp3 | Voc 4 | ☐ On ☒ Off | Mute button |
  
⸻  
**Track 4: four (A)**  

| Stem                   | Description | Default State | Notes             |
| ---------------------- | ----------- | ------------- | ----------------- |
| 04A.mp3                | Main mix    | Always on     | Cannot be toggled |
| 04Adrums1.mp3 (or 2-3) | Drums       | ☐ On ☒ Off    | Mute button       |
  
⸻  
**Track 5: five**  

| Stem           | Description | Default State | Notes                 |
| -------------- | ----------- | ------------- | --------------------- |
| 05A.mp3 (or B) | Main mix    | Always on     | Cannot be toggled     |
| 05fluteg1.mp3  | Flute g1    | ☐ On ☒ Off    | Button (play on hold) |
| 05flutea1.mp3  | Flute a1    | ☐ On ☒ Off    | Button (play on hold) |
| 05flutec2.mp3  | Flute c2    | ☐ On ☒ Off    | Button (play on hold) |
| 05fluted2.mp3  | Flute d2    | ☐ On ☒ Off    | Button (play on hold) |
| 05flutee2.mp3  | Flute e2    | ☐ On ☒ Off    | Button (play on hold) |
  
⸻  
**Track 6: six**  

| Stem            | Description | Default State | Notes             |
| --------------- | ----------- | ------------- | ----------------- |
| 06synth.mp3     | Synth       | Always on     | Cannot be toggled |
| 06whistling.mp3 | Whistling   | ☒ On ☐ Off    | Mute button       |
  
⸻  
**Track 7: seven (B)**  

| Stem | Description | Default State | Notes |
| ------------- | ----------- | ------------- | -------------------------------------- |
| 07B.mp3 | Main mix | Always on | Cannot be toggled |
| 07Bdronec.mp3 | Drone c | ☒ On ☐ Off | Volume fader (default state no volume) |
| 07Bdronee.mp3 | Drone e | ☒ On ☐ Off | Volume fader (default state no volume) |
| 07Bdroneg.mp3 | Drone g | ☒ On ☐ Off | Volume fader (default state no volume) |
  
⸻  
**Track 9: nine (A)**  

| Stem              | Description     | Default State | Notes                 |
| ----------------- | --------------- | ------------- | --------------------- |
| 09A1.mp3 (or 2-3) | Main mix        | Always on     | Cannot be toggled     |
| 09Akeys1.mp3      | Rhodes normal   | ☒ On ☐ Off    | Keyboard state button |
| 09Akeys2.mp3      | Rhodes reversed | ☐ On ☒ Off    | Keyboard state button |
| 09Akeys3.mp3      | Rhodes flipped  | ☐ On ☒ Off    | Keyboard state button |
  
⸻  
## Rare/Special Events  
  
Content that only appears under unusual conditions:  

| Event     | Condition                 | What Happens              |
| --------- | ------------------------- | ------------------------- |
| Full moon | Moon phase = full ± 1 day | Track 7 alternate version |
  
⸻  
## Release Information  
  
- **Release date:** ?  
- **Total tracks:** 11  
- **Audio format:** MP3 256 kbps  
⸻  
## Technical Notes  
  
- Tone.js for audio playback  
- NoSleep.js for mobile device support  
- localStorage for persistence (play counts, unlock states)  
- No backend required (all client-side logic)  

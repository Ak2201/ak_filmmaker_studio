/* The Dark Knight sample: everything that is not a scene row or a page.
   ALL OF IT IS INVENTED. Read by make-sample-darkknight.mjs. */

export const TITLE = 'The Dark Knight';

export const ABOUT = [
  'THE SAMPLE PROJECT - The Dark Knight (2008), a feature.',
  '',
  'READ THIS FIRST. This is a RECONSTRUCTION FOR PRACTICE. Everything in',
  'this file that looks like production paperwork is INVENTED: the',
  'schedule, the shoot dates, the budget, the unit list, the call sheets,',
  'the recce notes, the shot list, the boards and the documents. They are',
  'imagined as if a Chennai unit were making the film, in rupees, with',
  'invented Chennai and Tamil Nadu stand-ins for every location. None of it',
  'is the real production\'s paperwork, and no part of it was taken from it.',
  '',
  'NO LINE OF THE REAL SCREENPLAY. The pages in',
  'sample.darkknight.script.json follow the public structure of the film',
  'scene by scene, but every action line and every line of dialogue is',
  'newly written for this app. The famous lines are deliberately absent.',
  'The script is in English, and the dialogue is written to be shot as it',
  'stands.',
  '',
  'NO REAL CAST OR CREW. Every name in the `contacts` list is invented,',
  'with a +91 90000 2xxxx number and a @darkknight.example address -',
  '`.example` is a reserved TLD and can never route. The `role` column',
  'carries CHARACTER names, which belong to the story. No real actor,',
  'director or crew member is named anywhere in the paperwork, and the',
  'director\'s sign-off date on the HOD sheet is left blank.',
  '',
  'WHAT IT IS FOR. A second worked film beside Dragon, so every module',
  '(breakdown, stripboard, reports, contacts, visualize, write, plan and',
  'budget) has a bigger, action-heavy example to show: night work, stunts,',
  'a set-piece demolition, two sets built on a stage and a marine unit.',
  'Delete the project, or edit any of it, and nothing is lost.'
];

/* Two shoot calendars share one start: Monday 2 March 2026 (invented),
   six days a week, no Sundays. The builder derives the dates. */
export const FIRST_DAY = '2026-03-02';
export const SHOOT_DAYS = 22;

export const BLUEPRINT = {
  meta_writer: 'Sample reconstruction - an invented unit, no real crew',
  meta_started: 'Sample data - invented paperwork for a real film',
  meta_stage: 'All five stages',
  v1_genre: 'Crime thriller - Action',
  v1_draft: 'Reconstruction draft - 40 scenes, condensed',
  v2_director: 'Rangarajan Mahalingam (invented)',
  v2_producer: 'Meenakshi Pictures (invented)',
  v2_start: '2 Mar 2026 (invented floor date)',
  v2_budget: '₹ 84 crore all-in - sample estimate, not the production\'s figure',

  s1_whatif: 'What if the one man who keeps a city safe discovers that the thing it fears most is not a person with a plan but a person who wants to prove it has none?',
  s1_why_me: 'Because the film is a worked lesson in how to keep an action movie argumentative. Every set piece is a question, and the questions pile up until the hero has to pick a lie to protect the people. That is a structure worth taking apart, which is why it is the sample.',
  s1_image: 'A school bus idling at a bank at opening time, and four men in clown masks stepping down from it as if getting off at their own stop.',
  s2_log1: 'A masked guardian and a crusading prosecutor try to end a city\'s crime, and an anarchist makes them pay for it.',
  s2_log2: 'A vigilante, a police captain and a prosecutor join forces against organised crime, only to be pulled apart by a painted stranger who wants to show that nobody keeps their principles under pressure.',
  s2_log_final: 'When a painted stranger robs the mob\'s banks and sets a city\'s decent people against one another, a masked vigilante, a police captain and a young prosecutor must decide how much of the truth the city can survive.',
  s3_theme: 'A city needs a hope it can believe in more than it needs the truth about the people who hold it up.',
  s3_ext: 'Can the three of them break the mob and stop the Joker before the next name on his list dies?',
  s3_int: 'Can the man in the mask accept being hated so that the prosecutor can be loved?',
  s3_phil: 'Is a good lie, told to protect people who could not bear the truth, the same as cowardice?',
  s4_arc: 'From a man who wants to retire the mask to a man who accepts it is the only office he can hold.',
  s4_name: 'BRUCE WAYNE / BATMAN',
  s4_age: '34',
  s4_want: 'To hand the city to somebody in daylight and go home.',
  s4_need: 'To accept that being trusted and being thanked are different jobs.',
  s4_lie: 'If the city has a better man, it will not need him.',
  s4_wound: 'He lost his parents to a mugging and has spent his life converting grief into a system.',
  s4_skill: 'He can plan for any outcome except the one that costs him what he is.',
  s4_flaw: 'He cannot let anybody else carry the city, so he carries it alone.',
  s5_name: 'THE JOKER',
  s5_want: 'To show that every person has a price and every rule has a breaking point.',
  s5_philosophy: 'People are only as decent as the pressure on them is light.',
  s5_hero: 'He never lies about what he is. He tells every person exactly what he will do and then does it, and that is what makes him impossible to bargain with.',
  s5_mirror: 'The hero holds that people are good and must be protected. The Joker holds that they are not and must be shown. Both have built a whole life on a single unprovable sentence.',
  s5_humanity: 'He gets no pleasure from winning. He is only ever relieved to be proven right, and the film lets the audience see how much he needs it.',
  s6_ally_name: 'ALFRED - the butler and conscience',
  s6_ally_reflect: 'He is the only person who has watched the hero long enough to know what it costs.',
  s6_ally_subplot: 'He holds a letter that could end the story the hero is telling himself.',
  s6_ally_exit: 'He keeps the letter and burns it in a quiet kitchen, and nobody is ever told.',
  s6_lover_name: 'RACHEL - the childhood friend',
  s6_lover_sees: 'That the hero has chosen a mask over the one person who would have asked him to take it off.',
  s6_lover_goal: 'To be free to choose a life that is not rescued by somebody else.',
  s6_lover_decision: 'She chooses the prosecutor and writes the hero a letter that says so.',
  s6_mentor_name: 'FOX - the engineer',
  s6_mentor_tool: 'He gives the hero the machines, and the film asks what they are for.',
  s6_mentor_failure: 'He builds the listening machine against his own conscience, and decides to resign after using it once.',
  s7_era: 'Present day, one week in the life of a city',
  s7_location: 'Chennai - a bank in Mylapore, a glass tower in Guindy and Taramani, a mill in Ambattur, the port at Ennore, a half-built tenement in Royapuram',
  s7_duration: 'Seven days, from the bank to the last night on the river road',
  s7_rules: '1. The Joker never lies about what he intends. 2. The hero is never shown choosing the easy option. 3. Every set piece asks a moral question and is staged so the audience answers it before the characters do. 4. The city is a character: its roads, its ports, its noise. 5. The last image is a lie told for a reason.',
  s7_sensory: 'Sodium light on wet concrete, the noise of a port, a tube light that hums in an interview room, a purple card in a pocket.',
  s9_chrono: 'The bank → the rooftop → the mob meeting → the prosecutor → the accountant → the Joker\'s offer → the fundraiser → the funeral → the convoy → the interrogation → the two explosions → the hospital → the ferries → the tower → the coin and the fall → the river road.',
  s9_screen: 'Chronological and escalating, with the interrogation as the hinge: after it every choice is a trap for somebody.',
  s9_why: 'The film asks the audience to enjoy the villain for half the picture, so the structure has to give him wins early and then price them. Each act turns up the cost of the one before.',
  s10_setup_1: 'A coin the prosecutor flips as a joke in a restaurant.',
  s10_pay_1: 'The same coin deciding a family\'s future on the third floor of a half-built block.',
  s10_setup_2: 'A butler is handed a letter to keep until it matters.',
  s10_pay_2: 'The letter is what the hero decides he cannot allow anybody else to read.',
  s10_setup_3: 'An accountant says he is a careful man.',
  s10_pay_3: 'He is the first person to put a name on the thing nobody planned for.',
  s10_setup_4: 'A listening machine is built with a promise it will be used once.',
  s10_pay_4: 'It finds the man it was built for, and its engineer resigns.',
  s10_setup_5: 'A rooftop searchlight with a bat-shaped hole in it.',
  s10_pay_5: 'The last time the light is switched on, it is to warn a city of something it cannot see.',

  b01: 'A school bus outside a bank. A robbery in which each man is only needed until the next job is done.',
  b02: 'The theme stated as a negotiation: a captain asks the vigilante to guard the people who are imitating him.',
  b03: 'The three allies and the plan: a lawyer in court, a captain on the street and a vigilante in the dark.',
  b04: 'A man in make-up walks into a mob meeting with the bank\'s own money and an offer nobody can refuse.',
  b05: 'The hero is tempted to retire; the butler says the city forgets its saviours.',
  b06: 'He chooses to go and fetch the accountant from across the sea. The act-two choice is an escalation, not a plan.',
  b07: 'The fundraiser, the guests, the first sign of the clown, and the first time the hero catches somebody mid-fall.',
  b08: 'The Joker sets a deadline and a list. The city counts its dead in names.',
  b09: 'The prosecutor claims to be the vigilante. A false victory: the killing stops, and the lie begins.',
  b10: 'The convoy chase, the arrest, and the interrogation in which the villain wins by telling the truth.',
  b11: 'Two explosions. The hero chooses and the choice costs him the one person he was trying to save.',
  b12: 'A hospital. The prosecutor is visited by a man in an orderly\'s coat and the film marks the turn.',
  b13: 'The hero builds the machine he swore he would not, and its engineer says he will use it once.',
  b14: 'Two ferries and a tower. The people choose not to do what the villain says, and the villain is proven wrong for once.',
  b15: 'The coin and the fall, and a lie told on a river road so the city can sleep.',
  s12_note_v1: 'Decide now which of the first act\'s small gestures (the coin, the card, the searchlight) will carry the finale, and plant each of them twice. Do not let the villain and the hero end up in different pictures.',

  v2s1_draft: 'Reconstruction draft - 40 scenes, condensed for the sample. Locked 20 Feb 2026 (invented).',
  v2s1_weak: '1. The ferry scenes ask the audience to hold two stories at once. 2. The interrogation runs long and has to be shot in one night. 3. The two explosions happen in different buildings in the same minute.',
  v2s1_signoff: 'Invented sign-off, for the sample: producer, DOP and editor on 21 Feb 2026. The director\'s row on the HOD sheet carries no date.',
  v2s2_theme: 'A city needs a hope it can believe in more than it needs the truth about the people who hold it up.',
  v2s2_tone1: 'Grimy / Gritty',
  v2s2_tone2: 'Propulsive · morally tangled · night-bound · merciless in the last third',
  v2s2_refs: 'Heat for the street-level crime, Seven for the villain-as-argument, and Raatchasan for the way a Tamil thriller lets a plan fail without ceasing to be fun.',
  v2s2_refuse: 'No villain who explains himself in a flashback. No hero who gets the last word. No safe set piece. No speech from the mayor. No music that tells the audience whose side to be on.',
  v2s2_para: 'Everything we build exists to put the audience in the position of the characters. They are asked to choose, quickly, with incomplete information, and the camera never knows more than they do. The look is cold, the cutting is hard, and nothing in the design flatters the city.',
  v2s3_palette: 'Slate blue, sodium amber, hospital green',
  v2s3_light: 'Sodium lamps and tube light, never a soft source. The funeral is shot in white overcast; the last night in a dawn that arrives late.',
  v2s3_frames: 'Wide and locked off for the city, handheld inside the Joker\'s scenes, and a single long lens on every close-up of Dent.',
  v2s3_texture: 'Cold / steel-blue',
  v2s3_location: 'Shared drive · DARKKNIGHT/02_LOOKBOOK (sample)',
  v2s5_camera: 'ARRI Alexa Mini LF',
  v2s5_aspect: '2.39:1 (Scope / CinemaScope)',
  v2s5_fps: '24 fps',
  v2s5_res: '6K',
  v2s5_lens: 'Zeiss Master Primes - 18, 25, 32, 50, 75; Atlas anamorphics on the chase',
  v2s5_speciallens: 'Probe lens for the lorry flip; 100mm macro for the coin',
  v2s5_light_phil: 'A single hard source in every night scene, and a polarizer on every glass tower. Capture is 6K open gate, delivered 4K DCI.',
  v2s5_grade: 'Cold and clean through the first two acts so the last night can turn gold and stay there.',
  v2s5_dn: '~60% night, ~40% day',
  v2s6_sets: 'Interrogation room, underground workshop and penthouse (built on the Madhavaram stage), everything else location.',
  v2s6_dressed: 'The Joker\'s purple card is a continuity spine: 1,000 printed, 12 hero copies, and it must read at three metres.',
  v2s6_heroprops: 'Dent\'s silver coin (six copies, one weighted), the purple card, and the stopped wall clock.',
  v2s6_recurring: 'The card, the coin, the stopped clock, the searchlight.',
  v2s6_period: 'Present day. No identifiable local brands on any vehicle or sign.',
  v2s6_pd: 'Latha Chidambaram',
  v2s6_ad: 'Parthiban G',
  v2s6_setlead: 'Murugan S',
  v2s6_artbudget: '₹ 6,20,00,000',
  v2s7_designer: 'Kalpana Ranganathan',
  v2s7_hair: 'Sheela Dharmaraj',
  v2s7_makeup: 'Sheela Dharmaraj',
  v2s7_sfx_need: 'Specialised supervisor required',
  v2s7_protag: 'A hard suit in three stages: new, worn, and the one he leaves behind in the last reel.',
  v2s7_antag: 'A purple coat that never changes and a paint face that is re-applied before every scene.',
  v2s7_period: 'Present day, the city in civvies; the police in dress uniform for the funeral.',
  v2s10_composer: 'Joshua Daniel',
  v2s10_songs: '0 (no songs)',
  v2s10_bgm: 'Twenty-six cues, 78 minutes. A single sustained string note under every Joker scene, and not a note of score under the ferries.',
  v2s10_refs: 'Industrial percussion and bowed metal for the chase; a bare piano for the interrogation.',
  v2s10_sd: 'Joshua Daniel',
  v2s10_psr: 'Yazhini Nambiar',
  v2s10_phil: 'The silence on the ferries is a rule, not a gap. Mix is nine days at a Chennai stage (sample).',
  v2s10_mix: 'Dolby Atmos',
  v2s11_blocks: 'Four blocks: the bank and the stage sets (days 1-10), the tower, the hospital and the roads (days 11-18), the port (days 19-20), the tower finale and the river (days 21-22).',
  v2s11_ad: 'Muthu Pandian',
  v2s11_expday: 'Day 22 - the half-built tenement and the river road, one unit, two locations, a full night.',
  v2s11_total: '840000000',
  v2s11_atl: '240000000',
  v2s11_btl: '380000000',
  v2s11_post: '110000000',
  v2s11_cont: '15% (recommended)',
  v2s11_largest: 'The convoy chase, the hospital demolition and the ferry unit, which together are a third of the shoot.',
  v2s11_dop: 'Sundar Raman',
  v2s11_pd: 'Latha Chidambaram',
  v2s11_editor: 'Anwar Basha',
  v2s11_composer: 'Joshua Daniel',
  v2s11_sound: 'Yazhini Nambiar',
  v2s11_cd: 'Kalpana Ranganathan',
  v2s11_casting: 'Gayathri Anbumani',
  v2s11_pm: 'Venkat Subbu',
  v2s12_recce: '9-13 Feb 2026 (invented) - the bank in Mylapore, the Ennore port, the Ambattur mill, the Manali depot, the Taramani tower, the Royapettah hospital wing and the Sholinganallur shell.',
  v2s12_problems: '1. The hospital wing can be demolished once. 2. The port is only available for two consecutive nights. 3. The tower crane for the extraction is rented by the night. 4. The elevated expressway is closed for eight hours with one shot at the flip. 5. Two sets are built on the Madhavaram stage and share one crew.',
  v2s12_resolutions: '1. Seven cameras on the demolition, one pass. 2. The two ferry nights are scheduled back to back, port crew only. 3. The crane is booked for the Taramani night and nothing else. 4. Full rehearsal on a closed stretch the week before. 5. Stage sets shot in one block.',
  v2s12_note: 'Shoot the bank first. It is the film in miniature: a plan that works until it meets a person who knows how it ends.',
  p3_start: '2 Mar 2026',
  p3_base: 'Mylapore bank, then the Madhavaram stage',
  p3_ad: 'Muthu Pandian',
  p4_editor: 'Anwar Basha',
  p4_lock: '30 Jun 2026',
  p4_sound: 'Chennai mix stage (sample)',
  p4_music: 'Joshua Daniel',

  lad_1_logline: 'When a painted stranger robs the mob\'s banks and sets a city\'s decent people against one another, a masked vigilante, a police captain and a young prosecutor must decide how much of the truth the city can survive.',
  lad_2_synopsis: 'A masked guardian, a tired police captain and a prosecutor who works in daylight agree to dismantle the mob that owns the city. They get close. A figure in make-up robs the mob\'s own banks, offers to kill the guardian for half of what he is worth, and sets a deadline for the city to give him up. The prosecutor takes the blame to stop the killing and is nearly killed for it. The guardian is made to choose between two people in two places and chooses wrong. By the end, the prosecutor is a monster and the guardian is the only man who can protect his memory, which he does by taking the blame.',
  lad_3_onepager: 'Genre: crime thriller / action. Length: about 91 pages / 40 scenes (condensed reconstruction). Budget: ₹84 cr (sample estimate). Schedule: 22 days, Chennai. The hook is that the villain tells the truth and the heroes have to lie.',
  lad_4_treatment: 'See Write → documents → \'The Dark Knight - sample treatment (reconstruction)\'.',
  lad_5_outline: 'Fifteen beats, in step 08, condensed from the Save the Cat sheet.',

  palette_c1: '#2a3a4d',
  palette_c1_name: 'Slate blue',
  palette_c2: '#d98a2b',
  palette_c2_name: 'Sodium amber',
  palette_c3: '#6a9a8d',
  palette_c3_name: 'Hospital green',

  hod_dir_name: 'Rangarajan Mahalingam',
  hod_dir_date: '',
  hod_prod_name: 'Gayathri Anbumani',
  hod_prod_date: '2026-02-21',
  hod_dop_name: 'Sundar Raman',
  hod_dop_date: '2026-02-21',
  hod_pd_name: 'Latha Chidambaram',
  hod_pd_date: '2026-02-22',
  hod_ad_name: 'Muthu Pandian',
  hod_ad_date: '2026-02-23',
  hod_sd_name: 'Yazhini Nambiar',
  hod_sd_date: '2026-02-23',
  hod_comp_name: 'Joshua Daniel',
  hod_comp_date: '2026-02-24',
  hod_ed_name: 'Anwar Basha',
  hod_ed_date: '2026-02-21',
  hod_cos_name: 'Kalpana Ranganathan',
  hod_cos_date: '2026-02-22',
  hod_cast_name: 'Gayathri Anbumani',
  hod_cast_date: '2026-02-10',
  hod_pm_name: 'Venkat Subbu',
  hod_pm_date: '2026-02-23'
};

export const RECCES = {
  'Co-operative bank, Mylapore': {
    address: 'Closed co-operative bank, a main road off Luz Corner, Mylapore (invented)',
    contact: 'Branch trust office - Mr D. Anandan (invented)',
    permission: 'approved',
    power: 'Building supply, 40A single phase. Genny for the exterior.',
    parking: 'Road-side, 12 vehicles; the school bus parks in the lane behind.',
    toilets: 'Two on the ground floor, open for the unit.',
    bestTime: '07:00-17:00, with the shutters up at 08:00 for the hero exterior.',
    cost: '₹ 70,000 per day, two days agreed (sample figure)',
    notes: 'The bank is the only location in the shoot that sets the scale of the film on day one. One day for the exterior and the bus, one for the vault. No rolling over; the trust will not extend.'
  },
  'Rooftop, Anna Salai': {
    address: 'Rooftop of a commercial block on Anna Salai (invented)',
    contact: 'Building owner\'s representative - Mr S. Jayakumar (invented)',
    permission: 'approved',
    power: 'Rooftop supply, 20A. Battery power for the searchlight.',
    parking: 'Basement car park, 10 vehicles.',
    toilets: 'On the 6th floor.',
    bestTime: 'Night only, 19:00-04:00. The city bed is loudest before midnight.',
    cost: '₹ 90,000 for the night (sample figure)',
    notes: 'The searchlight is a hero prop on a bolted plate. Safety rig for every performer within three metres of the edge.'
  },
  'Chemical depot, Manali': {
    address: 'Closed chemical depot, near the Manali industrial belt (invented)',
    contact: 'Depot manager - Mr K. Raghunathan (invented)',
    permission: 'approved',
    power: 'Depot supply, 63A three phase. Genny for the night unit.',
    parking: 'Yard, 30 vehicles.',
    toilets: 'Depot block, open for the unit.',
    bestTime: 'Night only. Explosion rig after 21:00 with the fire tender on set.',
    cost: '₹ 1,20,000 per night, three nights agreed (sample figure)',
    notes: 'The depot is licensed for one controlled burn. The fire marshal signs the rig before the day and again before the pass. No second take on the explosion.'
  },
  'Sessions court, Egmore': {
    address: 'Old Sessions Court building, Egmore (invented)',
    contact: 'Court administrator - Mrs V. Lalitha (invented)',
    permission: 'approved',
    power: 'Court supply, 32A. No genny allowed inside.',
    parking: 'Court compound, 20 vehicles.',
    toilets: 'Ground floor.',
    bestTime: 'Weekend only, 07:00-18:00. Day interior for two scenes.',
    cost: '₹ 55,000 per day, one day agreed (sample figure)',
    notes: 'A working court on weekdays, so one Sunday for both scenes. Sixty background in the gallery and a polite sign on every door.'
  },
  'Heritage hotel, Mylapore': {
    address: 'Heritage hotel, a lane off Mylapore tank (invented)',
    contact: 'General manager - Mr R. Bhaskaran (invented)',
    permission: 'approved',
    power: 'Hotel supply, 100A. Backup genny for the ballroom.',
    parking: 'Basement, 30 vehicles.',
    toilets: 'Ballroom foyer.',
    bestTime: 'Night, 17:00-04:00; hotel guests out of the east wing.',
    cost: '₹ 1,80,000 for the night (sample figure)',
    notes: 'The ballroom and the restaurant on one night, both within the east wing. A hundred and twenty background in evening wear, called in two waves.'
  },
  'Old mill, Ambattur': {
    address: 'A disused spinning mill in an Ambattur industrial estate (invented)',
    contact: 'Estate caretaker - Mr P. Nataraj (invented)',
    permission: 'approved',
    power: 'No live supply. Two gennys and a lighting plant.',
    parking: 'Mill yard, 40 vehicles.',
    toilets: 'Portable toilets on the yard.',
    bestTime: 'Any, but all scenes are night interiors. Windows painted black before the day.',
    cost: '₹ 90,000 per night, one night agreed (sample figure)',
    notes: 'Three scenes on one night. The meeting and the Joker\'s entrance are a single room and a single light; Rachel\'s drum is the one corner with a separate rig.'
  },
  'Police HQ, Egmore': {
    address: 'Old police building, Egmore (invented)',
    contact: 'Station adjutant - Inspector M. Selvam (invented)',
    permission: 'approved',
    power: 'Station supply, 63A.',
    parking: 'Compound, 25 vehicles.',
    toilets: 'On the first floor.',
    bestTime: 'Day for one scene, night for two. Station working in the east wing.',
    cost: '₹ 60,000 per day (sample figure)',
    notes: 'The long upper room with the high fans is the only real police room in the film. The interrogation room is a set; this is for the briefing, the Joker\'s letter and the mayor\'s meeting.'
  },
  'Underground workshop, Madhavaram stage': {
    address: 'Built set - Stage 3, Madhavaram (invented)',
    contact: 'Parthiban G (art)',
    permission: 'approved',
    power: 'Stage supply, 100A three phase.',
    parking: 'Stage compound, 20 vehicles.',
    toilets: 'On the stage.',
    bestTime: 'Any. Two scenes, night interiors.',
    cost: '₹ 1,40,000 stage rent for 3 days (sample figure)',
    notes: 'A long cavern with a wall of phones and a workbench. Removable fourth wall so a 50mm can sit on the bench line.'
  },
  'Business tower, Taramani': {
    address: 'A glass office tower in Taramani (invented)',
    contact: 'Facilities manager - Ms A. Revathi (invented)',
    permission: 'approved',
    power: 'Lobby supply; roof supply on request.',
    parking: 'Basement, 18 vehicles.',
    toilets: 'On the 3rd floor.',
    bestTime: 'Day for the atrium; night for the roof, from 21:00.',
    cost: '₹ 2,50,000 for two days (sample figure)',
    notes: 'The only crane scene. The tower crane is rented by the night, so the roof day is a clean one. The atrium day is the day before.'
  },
  'Government hospital, Royapettah': {
    address: 'A closed wing of a government hospital, Royapettah (invented)',
    contact: 'Medical superintendent - Dr L. Chitra (invented)',
    permission: 'approved',
    power: 'Hospital supply; backup generator.',
    parking: 'Staff car park, 20 vehicles.',
    toilets: 'Wing toilets.',
    bestTime: 'Night. The wing is demolished once, and the demolition is the shoot.',
    cost: '₹ 6,50,000 for the wing, two nights agreed (sample figure)',
    notes: 'The wing is scheduled for demolition; the film pays the municipality to do it on the night and shoot it with seven cameras. A fire marshal and a structural engineer are on set from call.'
  },
  'Ennore port, ferry berth': {
    address: 'A working berth at Ennore port (invented)',
    contact: 'Port operations - Capt. T. Balasubramanian (invented)',
    permission: 'approved',
    power: 'Berth supply, 63A. Floating lights from the tug.',
    parking: 'Port yard, 40 vehicles.',
    toilets: 'On the berth.',
    bestTime: 'Two consecutive nights. The two ferries are hired for the shoot and a safety boat sits off each bow.',
    cost: '₹ 4,00,000 per night (sample figure)',
    notes: 'The second hardest location in the film. Two ferries, two hundred passengers and forty prisoners, and a marine unit watching the weather.'
  },
  'Unfinished tower, Sholinganallur': {
    address: 'An unfinished high-rise shell in Sholinganallur (invented)',
    contact: 'Contractor - Mr N. Ganesan (invented)',
    permission: 'approved',
    power: 'Site supply, 63A. Two gennys at ground level.',
    parking: 'Site yard, 30 vehicles.',
    toilets: 'Site toilets, ground floor.',
    bestTime: 'Night, 19:00-05:00. The structure is open; wind and rain are the hazards.',
    cost: '₹ 1,50,000 for the night (sample figure)',
    notes: 'The scaffold rigs are built the week before. The roof scene needs a crane and a safety net, and the floor scene needs the lighting crane at the open face.'
  }
};

export const MEDIA = [
  { title: 'Lookbook - sodium and slate', url: 'https://example.com/darkknight/lookbook-night', kind: 'Reference image', notes: '60 frames. The city at night, wet concrete, tube light.', linkedTo: 'Rooftop, Anna Salai' },
  { title: 'Recce photos - Ennore berth', url: 'https://example.com/darkknight/recce-ennore', kind: 'Recce photos', notes: 'Berth depth, ferry draught, the lamp positions. Read before the marine plan is signed.', linkedTo: 'Ennore port, ferry berth' },
  { title: 'Purple card artwork, 12 hero copies', url: 'https://example.com/darkknight/card-artwork', kind: 'Document', notes: 'Hero, insert, and an aged copy for the last reel. Must read at three metres.', linkedTo: 'Old mill, Ambattur' },
  { title: 'Demolition rehearsal clip', url: 'https://example.com/darkknight/demo-rehearsal', kind: 'Video', notes: 'The hospital wing from seven angles in a scale-model test.', linkedTo: 'Government hospital, Royapettah' }
];

/* ~31 contacts, all invented. Department must be one of DEPARTMENTS. */
const C = (name, role, department, n, notes) => ({
  name, role, department,
  phone: '+91 90000 2' + String(n).padStart(4, '0'),
  email: name.toLowerCase().replace(/[^a-z ]/g, '').replace(/ /g, '.') + '@darkknight.example',
  notes
});
export const CONTACTS = [
  C('Tharun Velavan', 'BRUCE WAYNE / BATMAN', 'Cast', 1, 'Lead, 20 of 22 days. Stunt prep on days 11 and 12; suit fitting 90 minutes.'),
  C('Sudhakar Pitchai', 'JOKER', 'Cast', 2, 'Fourteen days. Make-up call 90 minutes before every scene.'),
  C('Pranav Selvakumar', 'HARVEY DENT', 'Cast', 3, 'Nine days. Burn prosthetic on days 12, 18 and 22, three hours each.'),
  C('Raghunath Appadurai', 'GORDON', 'Cast', 4, 'Eleven days, including the funeral parade on day 15.'),
  C('Mythili Sundaram', 'RACHEL', 'Cast', 5, 'Seven days, all interior except the fall.'),
  C('Kandasamy Rengan', 'ALFRED', 'Cast', 6, 'Four days, all stage-built sets.'),
  C('Thirumalai Nambi', 'FOX', 'Cast', 7, 'Four days, the tower and the workshop.'),
  C('Balaji Ponnusamy', 'MARONI', 'Cast', 8, 'Three days: the court and the mill.'),
  C('Wen Li Natarajan', 'LAU', 'Cast', 9, 'Four days. Wire harness on day 14, with a double for the lift.'),
  C('Anandhi Raj', 'RAMIREZ', 'Cast', 10, 'Six days across the station and the river road.'),
  C('Sivasankar Dorai', 'THE COMMISSIONER', 'Cast', 11, 'Two days; the funeral is his last.'),
  C('Yamuna Pathy', 'THE MAYOR', 'Cast', 12, 'Four days, including the funeral and the station.'),
  C('Senthil Vendhan', 'GAMBOL', 'Cast', 13, 'Three days; one fight day at the depot.'),
  C('Rangarajan Mahalingam', 'Director', 'Direction', 14, 'Invented. Present on every day.'),
  C('Muthu Pandian', '1st AD', 'Direction', 15, 'Owns the port window and the parade closure.'),
  C('Priyanka Devarajan', '2nd AD', 'Direction', 16, 'Background wrangler for the parade (500) and the hospital evacuees (120).'),
  C('Hemalatha Jayaram', 'Script supervisor', 'Direction', 17, 'Keeps the card, the coin and the clock continuous.'),
  C('Sundar Raman', 'Director of Photography', 'Camera', 18, 'Seven cameras on the demolition, one pass.'),
  C('Arvind Kesavan', 'Focus puller', 'Camera', 19, 'Atlas anamorphics on the chase; Master Primes elsewhere.'),
  C('Manikandan P', 'Gaffer', 'Camera', 20, 'Sodium look at night; a single hard source in every scene.'),
  C('Yazhini Nambiar', 'Sound recordist', 'Sound', 21, 'Sound department on the ferries, with the engine on the track.'),
  C('Latha Chidambaram', 'Production Designer', 'Art', 22, 'Three stage sets and the tenement dressing.'),
  C('Parthiban G', 'Art director', 'Art', 23, 'Interrogation room, workshop and penthouse sets, built in four weeks.'),
  C('Kalpana Ranganathan', 'Costume Designer', 'Costume', 24, 'Three suits for the lead; the purple coat is a single hero piece with six doubles.'),
  C('Sheela Dharmaraj', 'Hair & Makeup', 'Makeup', 25, 'The Joker\'s paint, the burn prosthetics and the stunts\' continuity.'),
  C('Gayathri Anbumani', 'Producer / Production Manager', 'Production', 26, 'Owns the budget and the municipal sign-offs.'),
  C('Venkat Subbu', 'Production executive', 'Production', 27, 'Location permits, road closures and the marine unit.'),
  C('Karuppiah Raj', 'Stunt coordinator', 'Production', 28, 'Lorry flip, wire lift, fire gags and the fall.'),
  C('Anwar Basha', 'Editor', 'Post', 29, 'On set for the chase and the ferries.'),
  C('Joshua Daniel', 'Composer / Sound Designer', 'Post', 30, 'No score under the ferries; one string note under every Joker scene.'),
  C('Aparna Narayan', 'VFX supervisor', 'Post', 31, 'About 520 shots; the hospital and the lorry flip are the largest.')
];

export const CALL_SHEETS = [
  {
    title: 'The Dark Knight - Day 1',
    day: 1,
    generalCall: '06:00',
    location: 'Co-operative bank, Mylapore (unit base: lane behind the bank)',
    notes: 'SAMPLE CALL SHEET. A reconstruction for practice, invented like the rest of this project\'s paperwork - see the project note. The bank is two days only and does not roll over. Road closure from 06:30 on the east lane. Four clown masks, one school bus. Squib check at 07:00; the fire marshal signs before the first take. 25 background from 07:30.',
    sceneNumbers: ['1', '2'],
    calls: {
      'Rangarajan Mahalingam': '05:30', 'Muthu Pandian': '05:30', 'Priyanka Devarajan': '05:30', 'Hemalatha Jayaram': '05:45',
      'Sundar Raman': '05:45', 'Arvind Kesavan': '05:45', 'Manikandan P': '05:00', 'Yazhini Nambiar': '05:45',
      'Latha Chidambaram': '05:30', 'Sheela Dharmaraj': '05:00', 'Kalpana Ranganathan': '05:45',
      'Sudhakar Pitchai': '05:00', 'Karuppiah Raj': '05:30', 'Venkat Subbu': '05:00'
    }
  },
  {
    title: 'The Dark Knight - Day 12',
    day: 12,
    generalCall: '16:00',
    location: 'Chemical depot, Manali (unit base: yard)',
    notes: 'SAMPLE CALL SHEET. A reconstruction for practice, invented like the rest of this project\'s paperwork - see the project note. Night shoot, the heaviest day of the schedule: a controlled explosion, a fire gag and a tanker. The fire tender is on set from 15:30 and the fire marshal signs the rig at 17:00. One take on the explosion. Dent\'s burn prosthetic is a 3-hour call; Dent\'s make-up call is 13:00.',
    sceneNumbers: ['4', '26', '27'],
    calls: {
      'Rangarajan Mahalingam': '15:00', 'Muthu Pandian': '15:00', 'Priyanka Devarajan': '15:00', 'Hemalatha Jayaram': '15:30',
      'Sundar Raman': '15:30', 'Arvind Kesavan': '15:30', 'Manikandan P': '14:00', 'Yazhini Nambiar': '15:30',
      'Latha Chidambaram': '14:30', 'Sheela Dharmaraj': '13:00', 'Kalpana Ranganathan': '15:00',
      'Tharun Velavan': '14:30', 'Pranav Selvakumar': '13:00', 'Senthil Vendhan': '16:00',
      'Karuppiah Raj': '14:00', 'Venkat Subbu': '13:00', 'Aparna Narayan': '15:00'
    }
  }
];

export const SHOTS = [
  { scene: '2', number: '1', size: 'WS', angle: 'eye level', movement: 'static', lens: '25mm', description: 'The bank hall from the door. Twelve customers, ceiling fans, a long counter. Nothing is wrong yet.' },
  { scene: '2', number: '2', size: 'MS', angle: 'eye level', movement: 'handheld', lens: '32mm', description: 'The Joker crossing the floor behind the others. He is the only man who does not run.' },
  { scene: '2', number: '3', size: 'CU', angle: 'low', movement: 'static', lens: '75mm', description: 'The card going into the manager\'s pocket. Legible at three metres.' },
  { scene: '2', number: '4', size: 'EWS', angle: 'high', movement: 'crane', lens: '18mm', description: 'The bus pulling out as the alarm begins, one minute late.' },
  { scene: '12', number: '1', size: 'EWS', angle: 'high', movement: 'drone', lens: '24mm', description: 'The tower and the crane from above. The red lamp is the only point of reference.' },
  { scene: '12', number: '2', size: 'MS', angle: 'eye level', movement: 'handheld', lens: '32mm', description: 'Through the broken window with Batman. Glass, a collar, a pair of spectacles.' },
  { scene: '12', number: '3', size: 'WS', angle: 'low', movement: 'static', lens: '18mm', description: 'The two figures lifted into the night, shot from the street.' },
  { scene: '22', number: '1', size: 'WS', angle: 'high', movement: 'track', lens: '25mm', description: 'The convoy on the expressway, camera car on the outside lane. The lorry fills the mirror.' },
  { scene: '22', number: '2', size: 'MCU', angle: 'low', movement: 'static', lens: '50mm', description: 'The Joker on the roof of the lorry, coat flying. The only close shot in the chase.' },
  { scene: '24', number: '1', size: 'MS', angle: 'eye level', movement: 'static', lens: '50mm', description: 'The two of them across the steel table. No movement for the first minute.' },
  { scene: '24', number: '2', size: 'ECU', angle: 'eye level', movement: 'static', lens: '100mm macro', description: 'The stopped clock, ten past three.' },
  { scene: '38', number: '1', size: 'CU', angle: 'eye level', movement: 'static', lens: '100mm macro', description: 'The coin turning on the knuckles, caught once in the lantern light.' }
];

export const FRAMES = [
  { scene: '2', shotNumber: '3', caption: 'The card - board 1 of 2', ref: 'https://example.com/darkknight/board/sc02-03' },
  { scene: '12', shotNumber: '1', caption: 'Tower and crane, from above', ref: 'Overhead plate. The crane\'s red lamp at frame centre, the tower in two shades of black.' },
  { scene: '22', shotNumber: '1', caption: 'The convoy - board 1 of 3', ref: 'https://example.com/darkknight/board/sc22-01' },
  { scene: '24', shotNumber: '2', caption: 'The stopped clock, insert', ref: 'Insert plate. A wall clock, 3:10. The second hand stuck on the 6.' }
];

export const BOARDS = [
  {
    name: 'Palette',
    note: 'Slate blue, sodium amber, hospital green. Nothing in the city is allowed to be warm except the lamps.',
    entries: [
      { title: 'Slate blue', ref: 'https://example.com/darkknight/palette/slate', why: 'Every exterior and every glass tower. The colour of a city that does not look back.' },
      { title: 'Sodium amber', ref: 'https://example.com/darkknight/palette/sodium', why: 'The streetlamps, the depot, the port. The only warmth, and it is a warning.' },
      { title: 'Hospital green', ref: 'Swatch card - matte, paper white under glass', why: 'The ward, the interrogation tube light, the burn unit. A light that has no source.' }
    ]
  },
  {
    name: 'Light',
    note: 'One hard source in every night scene, and a polarizer on every glass tower.',
    entries: [
      { title: 'Tube light, interrogation', ref: 'https://example.com/darkknight/light/tube', why: 'Hard overhead, no fill. The Joker scene lives under it.' },
      { title: 'Sodium on wet concrete', ref: 'https://example.com/darkknight/light/sodium', why: 'The depot and the expressway. The look the whole film is judged against.' },
      { title: 'Lantern, the tenement', ref: 'Gaffer\'s test, 6 Mar', why: 'Scene 38 is one practical source and nothing else.' }
    ]
  }
];

export const DOCUMENTS = [
  {
    title: 'The Dark Knight - sample treatment (reconstruction)',
    kind: 'Treatment',
    body: 'SAMPLE DOCUMENT. This is a reconstruction written for the sample project, imagined as if a Chennai unit were making the film. The film - The Dark Knight (2008) - is real; this treatment is not the production\'s, and nothing in it was taken from the production. It stays at the level of premise, structure and craft.\n\nPREMISE. A masked vigilante, a police captain and a prosecutor who works in daylight agree to dismantle the mob that owns their city. A stranger in make-up robs the mob\'s own banks, offers to kill the vigilante for half of what the mob can pay, and sets the city a deadline: a name every night, until the mask comes off.\n\nTHE HOOK. The villain tells the truth about what he will do, and then does it. Everyone else lies, and the film is about the price of the lie that is worth telling.\n\nHOW IT IS BUILT. The first act sets up three allies and a plan. The second act is a series of traps, each one forcing a choice, each choice costing one of the allies. The last act asks whether ordinary people, with nothing to gain, will do what the villain says they will do. They do not, and he is wrong for once.\n\nTHE ANTAGONIST IS AN ARGUMENT. He is not a plan but a thesis, and every scene of his is a test of it. The structure gives him early wins and then lets the hero find the one thing he did not account for: that people are, on a bad night, kinder than they are asked to be.\n\nWHERE THE COST LANDS. On the prosecutor, who becomes the second villain, and on the hero, who accepts the blame for him. The last image is a lie told for a reason, and it is the only moment in the film where nobody is shown being tested.'
  },
  {
    title: 'Approach note - written for the sample, not by the film\'s director',
    kind: 'Director\'s Statement',
    body: 'SAMPLE DOCUMENT. Nobody connected with The Dark Knight wrote this. It exists so the Write module has a director\'s statement to show, and so a filmmaker reading the sample can see what one is for.\n\nThe discipline of this reconstruction is that every set piece asks a question the audience answers before the characters do. The bank asks whether a plan can be loyal. The ferries ask whether a stranger can be trusted with a trigger. The tower asks whether a hostage can tell the difference between rescue and a trap. We do not cut away from the answer.\n\nThat one rule decides the lenses (a wide on the city so we know where we are, a long lens on the faces so we know what they cost), the light (one hard source per night scene, sodium in the street, tube light indoors), and the blocking (the Joker is always the one who is still).\n\nWhat this approach refuses: a speech from the mayor, a flashback for the villain, a hero who gets the last word and a score that tells the audience whose side to be on. If the theme is that decency survives pressure in unexpected people, the film must be shot at the pressure and not at the rescue.'
  },
  {
    title: 'One-pager - for the market (sample)',
    kind: 'One-Pager',
    body: 'SAMPLE DOCUMENT. Invented for the sample.\n\nTITLE. The Dark Knight (reconstruction).\nGENRE. Crime thriller / action, Tamil with a pan-Indian release in mind.\nLENGTH. About 91 pages, 40 scenes, a 22-day schedule.\nBUDGET. ₹84 crore (sample estimate).\n\nTHE PITCH. A masked guardian, a captain and a prosecutor against a man who wants to prove that nobody keeps their principles under pressure. The villain never lies. The heroes do.\n\nWHY IT TRAVELS. The set pieces ask moral questions that need no language: a bank that kills its robbers, a hospital that goes up, two ferries and a trigger. The only scene that needs subtitles is the interrogation, and it is shot so that it does not.\n\nWHAT WE NEED. A 22-day shoot across Chennai, the port at Ennore and a stage in Madhavaram, a hospital wing to demolish, and a marine unit for two nights.'
  },
  {
    title: 'Character bible - Harvey Dent (sample)',
    kind: 'Character Bible',
    body: 'SAMPLE DOCUMENT. Invented for the sample; no real actor is attached.\n\nWHO HE IS. A prosecutor who is exactly as good in public as he is in private, and has never had to find out which of the two he would choose. He keeps a worn silver coin in a waistcoat pocket and uses it, he says, to tell the other side that he is thinking.\n\nWHAT HE WANTS. A city where nobody needs a mask. He wants to be the proof.\n\nWHAT BREAKS HIM. A phone line, a fire and a choice that is made for him. He loses the woman he loves and then the face he has built his reputation on, and he spends the last act looking for something that will tell him it was nobody\'s fault.\n\nHOW HE SPEAKS. In whole sentences, with a lawyer\'s patience, until the second half of the film, when he speaks in short ones and cannot be interrupted.\n\nHIS LAST SCENE. He gives the decision to the coin, and the coin gives it back.'
  }
];

/* The estimator. Items are PRESETS (rates.chennai.2024.json), because the
   item cell is a select; a value outside the list blanks it. Days x rate. */
export const CALC = [
  { item: 'ARRI Alexa Mini LF', days: '22', rate: '45000' },
  { item: 'ARRI Alexa 35', days: '14', rate: '48000' },
  { item: 'Zeiss Master Primes set', days: '22', rate: '42000' },
  { item: 'Atlas Anamorphic set', days: '10', rate: '25000' },
  { item: 'HMI 2.5K', days: '66', rate: '3800' },
  { item: 'Aputure 600D Pro', days: '44', rate: '3000' },
  { item: 'LED panel kit', days: '22', rate: '4000' },
  { item: 'Dolly + 30ft track', days: '22', rate: '3000' },
  { item: 'Crane 16ft', days: '10', rate: '7000' },
  { item: 'Steadicam + operator', days: '12', rate: '20000' },
  { item: 'Gimbal (Ronin) + op', days: '12', rate: '8000' },
  { item: 'Drone + pilot', days: '6', rate: '20000' },
  { item: 'Camera car', days: '8', rate: '6000' },
  { item: 'Generator 60 KVA', days: '22', rate: '7000' },
  { item: 'Generator 30 KVA', days: '22', rate: '4000' },
  { item: 'Production van', days: '44', rate: '3200' },
  { item: 'Sound recordist + kit', days: '22', rate: '6500' },
  { item: 'Comtek/IFB', days: '22', rate: '800' },
  { item: 'DOP', days: '30', rate: '22000' },
  { item: '1st AD', days: '40', rate: '11000' },
  { item: '2nd AD', days: '40', rate: '4500' },
  { item: 'Production Designer', days: '70', rate: '12000' },
  { item: 'Costume Designer', days: '50', rate: '8000' },
  { item: 'Editor', days: '120', rate: '6500' },
  { item: 'Sound Designer', days: '60', rate: '10000' },
  { item: 'Focus Puller', days: '22', rate: '5500' },
  { item: 'Gaffer', days: '22', rate: '5500' },
  { item: 'Production Manager', days: '60', rate: '6000' },
  { item: 'Electrician (each)', days: '264', rate: '1200' },
  { item: 'Sound mix studio (Atmos)', days: '12', rate: '65000' },
  { item: 'DI / color grade', days: '14', rate: '22000' },
  { item: 'VFX shot', days: '520', rate: '18000' }
];

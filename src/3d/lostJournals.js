// The Lost Journals — 24 pages from the field notebook of the researcher who
// helped build Bubbles aboard the MV OceaNova Horizon. Pure narrative data: the
// discovery logic and the reader UI live in ReefScene3D.js, which only ever
// reads this list. Entries unlock strictly in order, #01 → #24.
//
// Canon (fixed): Horizon was a split-deck research ship, 25 aboard. In a storm
// she collided with a barge; gear went overboard, Bubbles with it, half her
// memory card missing; a small electrical fire reached dangerous equipment and
// two minutes after the collision an explosion tore the ship in two. The stern
// rolled 180° and sank inverted 60 s later (4 survived: 3 from belowdecks via
// bottom hull doors, 1 from the stern superstructure). The bow floated five
// more minutes (12 survived) and sank seven minutes after the collision.
// 16 lived, 9 died. 14 survivors — the author among them — spent 18 hours in
// one inflatable liferaft; the barge pulled 2 more from the water; the barge's
// own crew all survived. OceaNova later shut down. Bubbles was never recovered
// by them. Everything else here (names, days, dialogue) is story, not canon.

export const JOURNAL_AUTHOR = 'Maya Bennets';   // the narrator
export const JOURNAL_AUTHOR_ROLE = 'Researcher on MV OceaNova Horizon';

export const JOURNAL_CHAPTERS = {
  I: 'Project Bubbles',
  II: 'Life Aboard Horizon',
  III: 'The Disaster',
  IV: 'Eighteen Hours',
};

const J = (n, chapter, title, date, ...paragraphs) =>
  ({ id: `lj${String(n).padStart(2, '0')}`, n, chapter, title, date, paragraphs });

export const LOST_JOURNALS = [
  // ── Chapter I — Project Bubbles ───────────────────────────────────────────
  J(1, 'I', 'A Side Project', 'Horizon · day 2, outbound',
    'Second day out and I have already lost a pen to the sea, which the bosun says is traditional. New notebook, then. Waterproof cover, pencil on a string, the kind the benthic team swears by, with MAYA BENNETS · RESEARCHER · MV OCEANOVA HORIZON printed inside the cover in capitals because the last one went to the sea unlabelled and I like to think it is still out there, anonymous. I am the junior researcher on that team, which means I am the only one on it who is not an intern, which makes me the responsible adult by default. This is a frightening thought and I am writing it down so I can be held to it.',
    'The interns are Priya, Teo and Mags. Priya codes, Teo builds, Mags wires, and all three of them think the survey drones are wasted. Horizon carries three Skips aft, like every survey ship does; the Skip class has been the workhorse of this business for years, boxy and reliable and about as curious as a brick. You tell a Skip where to go and it goes there and films what it is pointed at, and it has never once noticed anything. At one in the morning in the dry lab, Teo said the thing you are not supposed to say on a working ship: "We could just build one that goes and looks for itself." Priya had a laptop open before he finished the sentence.',
    'The printer belongs to the ship and lab hours belong to the company, so this will be a side project in the truest sense: it happens on the side of everything else, mostly after dinner. Teo has already drawn a capsule on a napkin. It has one eye. Priya says it needs a name before it needs a hull. Mags says it needs a fuse before either.'),

  J(2, 'I', 'The Printer', 'Horizon · day 4',
    'The dry-lab printer is meant for bottle clips and bracket replacements, and it does not love the sea. When the ship rolls, the print leans. So we print only on the flat hours, usually between two and five in the morning, and Teo stands beside it like a nurse. The hull is not ours. The Skip-class files have been in every ship\'s printer library for as long as there have been Skips, because Skips are forever losing fins and face plates and someone always has to print a spare. We are just the first people to print all of one, and we could not print it at full size: the bed is too small for a real Skip\'s body and we only have the spare filament the ship can\'t miss. So Teo scaled the whole thing down until the biggest piece fit, and she came out about two-thirds of a proper Skip. Capsule body in six pieces, round face plate, two little fins. You could carry her under one arm. Nobody has ever carried a Skip under one arm.',
    'Failures so far: one print that came out as a nest of plastic spaghetti, one that fused to the bed, and one that was perfect until Mags leaned on the table. The lab smells like hot plastic and instant noodles. The only paint aboard is hull-marking blue, so she will be blue. One eye, because two eyes cost twice as much and we only had one lens, salvaged from a drop-camera that died in the last survey.',
    'The propeller problem took a whole evening. One propeller, one motor, a printed guard so she cannot chew her own tail. Mags wired a battery out of a dead handheld sonar and made us all stand back for the first power-up, which did nothing, which Mags called "a good sign". Mags looked at the parts laid out on the bench and said, "You\'re building a Skip." Teo said, "We\'re building what a Skip could be." Mags said the hull did not know the difference. Priya said it would. Teo said a small one would get into places the big ones can\'t, and then looked pleased with himself for the rest of the night. Dr. Halloran walked through at midnight, looked at the capsule for a long moment, said "nice bottle clip," and left.'),

  J(3, 'I', 'bubbly_mess.exe', 'Horizon · day 7',
    'Priya has a brain for her now, which is a small board running a stripped-down system she pulled off the ship\'s retired tide-gauge logger, with a stack of her own scripts on top. The main process is called bubbly_mess.exe. That was a placeholder. On the first boot the microphone picked up the aquarium pump going blub, the speech log filled with nonsense, and the whole thing was, in Priya\'s words, a bubbly mess. She meant to rename it. It is day seven and I think the name has won.',
    'It is strange software. When it gets confused it restarts itself and announces the restart, politely, like someone leaving a room. It expresses certainty as a percentage and the percentages are terrible: it was 94% certain Teo was a fish. It keeps a log of everything it notices, and Priya admits the log is mostly guesses. For reasons she cannot explain, it insists on splitting its memory across two little cards. Card A is the system, she says. Card B is what it remembers. We back up card B every night, which is my job because I am the responsible adult.',
    'Mags, reading the boot screen: "You named the operating system bubbly mess?" Priya: "It named itself. I just didn\'t argue."'),

  J(4, 'I', 'First Conversations', 'Horizon · day 9',
    'She started answering. Not in a dramatic way; there was no moment where the lights dimmed. She simply began replying to things. Skips answer to numbers, the way they always have: every one ever built takes the next number in the sequence, so the three aft are Skip-19, Skip-27 and Skip-38, each of them half again her size, and in all their years of service not one of them has had an opinion. Forty-two Skips have been made. Teo had been logging her as Skip-43 for a week, because that is the next number and Teo respects a sequence. She had other ideas. The first word out of the speaker was "Bubbles!", aimed at the pump, and she now greets the pump every morning like an old friend. When the engines change pitch she hums. When anything happens at all she declares it "probably good". The interns took a vote and the name was settled before I got back from the cold room. The hull is a Skip. She is Bubbles. We are a team that lets machines name things.',
    'I log samples late, so I talk to her. She does not understand me, exactly, but she observes, and she tells you what she observed. Last night I sat still for ten minutes writing bottle numbers and she said, "You have been very still. I find that unsettling." Then, after a pause: "Also calming. Mostly unsettling." Priya swears she did not write that line. I have decided not to look.',
    'I know what she is. A hundred scripts in a trench coat, a lens from a dead camera and a motor from a dead sonar, held together with hull paint and Teo\'s optimism. I still said goodnight to her. She said, "Goodnight. 88% certain."'),

  J(5, 'I', 'Our Little Secret', 'Horizon · day 12',
    'The first mate asked about "the blue thing in the tank". Teo said "sampling calibration unit" without blinking, and the mate nodded and moved on, and the thing is, that is technically what she is now. We keep her in the seawater holding tank on the aft working deck, because it is the only water aboard big enough for her to move in. Every member of the science team knows. Nobody on the bridge does, officially. Dr. Halloran has agreed, in a formal sense, not to notice.',
    'What I did not expect is how the ship has adopted her. Benny in the galley saves her a spot on the counter when she is drying off, which she does not need, which he does anyway. The chief engineer has not asked a single question, which Mags says is the highest praise an engineer can give. Priya got worried that Bubbles never stops, so she coded a nap. Now at two in the morning the eye dims and she drifts to the bottom of the tank and hums at nothing. I have stopped saying "it". We all have.',
    'Halloran finally said something today, in the passage, not looking at me: "If anyone asks, she\'s an experiment. Which she is. Don\'t let her near the aft hold." We had not planned to. I did not ask why.'),

  J(6, 'I', 'More Than a Prototype', 'Horizon · day 14',
    'Last night she found a sea cucumber in the tank\'s drain filter. Nobody put it there; it came in with the seawater. She circled it twice, flashed her little light ring and announced: "New species. 61% certain. Recording." Then she made a list. It had one thing on it. It was the proudest I have ever seen a piece of plastic be, and I include some of the people I went to university with.',
    'Then she asked me a question, which she had never done. "Are you also an experiment?" I said yes. It seemed true. She said "Recorded," and went back to her sea cucumber. I sat there longer than I meant to. She is not alive, and she is not a pet, and I would not tell anyone at head office this, but she is a colleague-shaped thing, and the lab is a better place with her humming in it.',
    'I carry card B in my jacket pocket for the nightly backup. It is the size of a fingernail. It feels like carrying someone\'s diary.'),

  // ── Chapter II — Life Aboard Horizon ──────────────────────────────────────
  J(7, 'II', 'Another Day at Sea', 'Horizon · day 17',
    'Six o\'clock cast, bottles numbered, cold room, breakfast, repeat. Horizon looks like two ships that agreed to share a hull: the superstructure stands right up at the front, where we sleep and eat and work, then a long open deck runs aft to a separate block at the back with the engines and the hold. Walking the middle deck in a swell is the closest I will ever come to being a tightrope artist. There are twenty-five of us aboard, and after seventeen days I know all twenty-five by their coffee orders.',
    'The engineers play cards after dinner and let the interns lose to them. Benny bakes bread on Thursdays and the whole forward block smells like a bakery with diesel notes. The ship moves like a big patient animal, and when the gulls come screaming over the aft deck, Bubbles sits in her tank and tracks them with her one eye, flashing yellow, which means "known species", which is a lie, because she has no idea what a gull is.',
    'There is a comfort in a day where nothing happens. Logged 140 bottles, two seasick interns, one robot. All probably good.'),

  J(8, 'II', 'Little Discoveries', 'Horizon · day 20',
    'Upgrades. Mags gave her a scan beam: a ring of lights and the little sonar from the old handheld, sweeping in a cone while she turns her nose down and spins slowly like a very serious lighthouse. Green means "something new", yellow means "known", red means "nothing here, try again". Teo fitted a self-righting bladder, so when she tips over she sighs, inflates and comes back up looking offended. Priya taught her the species list from the survey manual, and now she corrects Teo on fish names, which he deserves.',
    'She has started surveying the tank on her own. "Charting," she calls it. Every night at the end of her log she writes the same line: "Day 20: everyone is probably fine." Priya found a file inside bubbly_mess.exe that none of us wrote. It is a counter. It goes up when something good happens, like being greeted, or finding the sea cucumber again, and it has never gone down. Priya has named the file feelings.',
    'Mags: "It\'s a bug." Priya: "It\'s a feature now." Teo: "Can we print her a hat."'),

  J(9, 'II', 'The Other Equipment', 'Horizon · day 22',
    'Something came aboard at the last port that I was not told about and did not ask about. Crates for the aft hold, strapped and placarded with symbols I do not recognise, and a padlock on the hold door where there used to be a latch. Two people from head office flew in with them and flew out the same afternoon without eating. Since then nobody goes aft of the hold without the chief engineer, and the safety briefing on the noticeboard has a new page.',
    'Mags read the new page twice and said only, "Whatever is in there, keep sparks away from it." I asked if she knew what it was and she said no, and I believed her, and I am not sure that made me feel better. This is a working ship and working ships carry things. But the aft deck is where Bubbles lives, and I catch myself walking her tank a metre further forward every time I pass it, like that would help.',
    'Halloran said "don\'t let her near the aft hold" two weeks ago. I thought he was being funny.'),

  J(10, 'II', 'Weather Reports', 'Horizon · day 25',
    'There is a low deepening to the west, and the radio officer has started pinning the forecasts up by the mess door, which he only does when he wants people to read them. The captain asked head office for permission to run for shelter and come back when it passes. The reply, as relayed by the galley, which knows everything, was that the sampling series has a schedule and the schedule has a client. So we hold station.',
    'The swell is already long and slow, the kind that makes the whole ship take a breath. The interns are grey. The tank on the aft deck slops over its rim every few seconds, and we have lashed everything in the lab that can be lashed. Teo keeps checking his watch as if the weather is running late.',
    'Priya asked Bubbles what she thought of the forecast. "34% certain it is weather," she said. Nobody laughed as much as we meant to.'),

  J(11, 'II', 'We Shouldn\'t Be Out Here', 'Horizon · day 27',
    'Six-metre seas. The long middle deck is taking green water now, whole waves sliding across it and pouring off the far side, and nobody crosses it without a line clipped on and a second person watching. I heard the captain and the chief engineer in the passage this afternoon, not shouting, which was worse. Head office says finish the series. The captain said a word I will not write in a notebook that other people might read.',
    'We have moved Bubbles\' tank into the lee of the aft block and wedged it with fenders, and it still walks. We are a laboratory on top of a bathtub inside a washing machine. The radio has been crackling all day with a tug somewhere out in this mess with a barge on a wire behind it, giving positions nobody can quite hear. A sampling schedule is not worth this. I am angry in a way that is not useful, so I am putting it here instead.',
    'I wrote "we shouldn\'t be out here" at the top of the page and then did not know what else to write.'),

  J(12, 'II', 'The Last Normal Day', 'Horizon · day 28, evening',
    'The wind dropped in the afternoon, enough that Benny risked pancakes, and the whole forward block came to the galley like something had been announced. Mags fell asleep at the bench with the soldering iron in her hand. It was switched off. We checked. Priya taught Bubbles a knock-knock joke, and Bubbles can do "knock knock" and "who\'s there" and then forgets the end, and says "Recorded," and we laughed every single time.',
    'I called home on the sat phone and talked to my sister about nothing for eleven minutes, which cost about what I earn in a day and was worth it. Then I started the nightly backup of card B, got halfway, and remembered the buoyancy test was scheduled for ten o\'clock, so I pulled the card and put it in my jacket pocket to finish after. She is out in the tank now, in the dark, holding her depth. She is good at it. Teo says she is better at it than he is.',
    'I said goodnight through the tank wall. "Goodnight. 97% certain." I will finish the backup tomorrow.'),

  // ── Chapter III — The Disaster ────────────────────────────────────────────
  J(13, 'III', 'Impact', 'the raft · hour 1',
    'I am writing this because if I do not put it in order now I will lose the order of it. Twenty to eleven. I was in the dry lab, forward, cleaning up after the pancake night. The ship was punched. That is the only word for it: a huge sideways blow that threw the whole bench over, bottles, laptops, the printer, me. The lights went out and came back brown. Underneath everything was a sound I had never heard a ship make, metal on metal, long and grinding, like the hull was being unzipped.',
    'Through the port window there was a wall where the sea should have been. Black, flat, enormous, so close I could see rivets in the rain. A barge. The one from the radio, with its tug somewhere beyond it in the dark. The collision alarm started, and then a different alarm, and the panel by the lab door lit a row of lights for the aft section, and the smell came through the vents: hot wiring, that sharp electrical smell. The speaker said fire party aft. Teo looked at his watch. He always does.',
    'I thought: the tank. Bubbles is in the tank on the aft deck. I did not go aft. The mate had the passage blocked with his whole body and was shouting everybody forward, up, out. I keep thinking about that.'),

  J(14, 'III', 'Two Minutes', 'the raft · hour 1',
    'The muster point is the forward deck outside the bridge. We got there in socks and lifejackets. Halloran counted heads in the passage and lost count and started again. Someone said it was a small fire. Someone said it was in the aft hold. Nobody said what was in the aft hold, and I realised standing there that I had never wanted to know as badly as I did not want to know right then. The rain was sideways. There was smoke in it.',
    'Teo was counting out loud, under his breath, from the moment of the hit. Priya had Mags by the hand. I had my notebook in my jacket and card B in the pocket under it and I kept pressing my palm against it like it was a lucky coin. Two minutes is nothing. Two minutes is long enough to put a lifejacket on, to count twelve people and go back for a thirteenth, to think that this is frightening but it is going to be alright.',
    'At two minutes, Teo said later, exactly, the ship broke.'),

  J(15, 'III', 'The Ship Breaks', 'the raft · hour 2',
    'There was a flash from the aft block that lit the rain white, and a sound I did not hear so much as get hit by, in the chest, and the deck jumped under us like a floor in an earthquake. When I could see again the long middle deck was simply not there. Where it had been was a gap full of fire and water and the stern was a separate thing, swinging away from us, its lights tipping the wrong way. The bow, our half, pitched up and settled, and somehow stayed.',
    'The mate and the second had the raft over the side before I understood what they were doing. It inflated with a bang, orange, huge, and we went down the ladder and the ladder ended and we went into the water. Seconds. Hands pulled me in by the lifejacket. People jumped and were pulled in. I counted the bow going down behind us by the lights on it: deck lights, bridge lights, the little lamp over the lab door, then nothing. Someone said seven minutes since the hit. I do not know. It felt like an hour and it felt like no time at all.',
    'Across the gap I saw the stern\'s lights roll over, slow, all the way, and go out. I did not understand what I was seeing. I think I do now.'),

  J(16, 'III', 'Where\'s Bubbles?', 'the raft · hour 2',
    'It was Priya who said it, into the dark, in a small voice, and nobody answered because nobody could. The aft deck is gone. The tank is gone. The fenders we wedged it with, the lines, the whole working deck, gone with the stern. She was in the water in her tank holding her depth and being good at it, and then there was no tank and no deck and no ship.',
    'I put my hand in my pocket and card B was there. It is still there. Half of what she remembers is in my jacket, dry, because I did not finish a backup. The rest of her is out in that. I keep trying to think what the water is like at the bottom here and I do not know; we never got that cast done.',
    'Then the bigger thought, the one I have been holding off. Faces. There are faces not in this raft. I do not know who got off the stern. Nobody does. The sea is very loud. I am putting the pencil away now.'),

  // ── Chapter IV — Eighteen Hours ───────────────────────────────────────────
  J(17, 'IV', 'Fourteen', 'the raft · hour 3',
    'Fourteen. We have counted four times and it is fourteen every time, which is the only thing in the world I am sure of. Me, Priya, Teo, Mags. Dr. Halloran. The first mate, the second, the radio officer, four of the deck crew. And two who should not be here at all: Ortiz the bosun and Dede from the engine room, who came to us out of the water from the stern side, swimming, and whom we pulled in by their collars.',
    'They were belowdecks when it happened. Ortiz told it flat, like a report. The stern went over, he said, all the way, bottom up, and the hull doors under the engine room, the ones that are supposed to open under the water, were suddenly a way up into the air. Three of them climbed out onto the upturned hull. Then it went down under them and they swam. The third, a motorman, swam the other way, towards the barge\'s lights. Ortiz thinks the barge got him. Ortiz hopes the barge got him.',
    'The raft is rated for sixteen and feels like it was built for six. Knees against knees, water sloshing round our feet, the canopy snapping overhead. Every time someone shifts, everyone shifts.'),

  J(18, 'IV', 'Every Wave', 'the raft · hour 5',
    'I did not know a raft would move like this. The ship moved like an animal; this moves like a leaf. Every wave picks the whole floor up under us and drops it, and the canopy cracks like a flag, and the drogue line goes tight and slack and tight. There is no part of your body that believes the floor is a floor. Three people are sick. The rest of us are only not sick because there is nothing left.',
    'Lightning, far off, and we all count the seconds without meaning to, because Teo counts and it is catching. The beacon on the canopy pole blinks every few seconds, white, steady, and it is the only thing on this raft doing its job properly. Mags has started counting waves instead of seconds. She is at four hundred and something. Nobody has told her to stop, because it means she is still here.',
    'Nobody sleeps. Nobody even pretends to.'),

  J(19, 'IV', 'The Cold', 'the raft · hour 8',
    'Wet through, all of us, and the wet does not dry, it just gets colder. Halloran has taken over the survival kit like it is a lab budget: foil blankets shared two to a blanket, one water sachet each every three hours on his watch, barley sugar for anyone who shakes. He runs a rota where everyone has to say something out loud every fifteen minutes. Anything. The radio officer recites shipping forecasts for places that are not here. Ortiz lists every bosun he has ever worked under, in order, with opinions.',
    'Priya sang. Badly, and on purpose, because she knows she sings badly and it made Mags laugh for the first time since the hit. Benny is not in this raft, and every so often someone says what Benny would say about the catering, and we agree with him. We are keeping him in the conversation. I understand why people do this now.',
    'I have my hands inside my jacket, one of them around a memory card. It is not keeping me warm. I am holding it anyway.'),

  J(20, 'IV', 'Missing', 'the raft · hour 11',
    'Twenty-five aboard. Fourteen here. I have been doing the arithmetic for hours and the arithmetic does not get better. Benny. The chief engineer and the two cadets, who were aft. The captain, who was on the bridge, forward, and who I did not see on the deck, and who nobody saw on the deck, and who I keep expecting to hear telling us to clip on. I say the names in my head and then I make myself stop, because the list does not help anyone in this raft.',
    'Ortiz thinks the barge turned back. It had its lights on when the stern went; he saw it from the water, big and square and lit up like a building. A barge that size cannot stop quickly, but it can come round, and its crew would have seen everything. It might have picked people up. He says "might" carefully. Thinking that it might have is the only warm thing in this raft, and we pass it around like the blankets.',
    'Teo asked, quietly, so only I could hear: "Do you think she sank or floated?" I said I did not know. I said she had a bladder. He nodded like that settled something.'),

  J(21, 'IV', 'No Sign', 'the raft · hour 14',
    'Grey light, and then a grey morning, and the sea finally easing off into long dull hills. We unlaced the canopy and looked out and there was nothing. No ship, no barge, no smoke, no tug. Just a circle of sea and a circle of sky and, in between, bits of Horizon: a crate lid, a bottle rack from the lab with four bottles still clipped in it, a fender, a life ring from the aft block turning slowly with no one in it.',
    'Halloran will not let us fire a flare at nothing. We have three. The second climbed up on the pole and watched the horizon for an hour and came down and said "no sign" and that is all anyone has said about it since. Teo saw something blue in the water, a long way off, and stood straight up in a rubber raft, which you must not do, and three people grabbed him. It was a fender. He sat back down and said nothing for a long time. I know what he thought it was. I thought it too.',
    'I have started writing the names of everyone in the raft on the inside cover of this notebook, in pencil, under my own, in case. Halloran saw me doing it and did not say anything, and then he spelled Dede\'s name for me.'),

  J(22, 'IV', 'Bubbles', 'the raft · hour 16',
    'I keep thinking about ordinary things. The first morning she said "Bubbles!" at the pump and Priya nearly dropped the laptop. The first time we put her in the tank and she refused to submerge, holding herself at the surface with the propeller, announcing that she was 62% certain water was wet and would like to confirm this before proceeding. The end of her log every night: everyone is probably fine. The knock-knock joke she never finished. "Who\'s there?" "Recorded."',
    'If she were here she would be flashing yellow at the fenders. Known species. She would be 94% certain that the raft was a fish. She would have made a list with fourteen things on it and been very proud of it, and the file called feelings would have gone up by one for every person pulled over the side, because that is what it counts, as far as any of us could ever tell.',
    'I know she is a hundred scripts in a trench coat. I still hope she is dry somewhere, which is stupid, which I am writing down anyway, because it is my notebook.'),

  J(23, 'IV', 'Still Here', 'the raft · hour 17',
    'I am so tired I can hear engines that are not there. Twice I have been sure of it, a low drone under the wave noise, and twice it was nothing, or the blood in my ears, or hope. Dede is asleep sitting up. Mags stopped counting waves somewhere past two thousand and has not started again. The water sachets are gone. The barley sugar is gone. The beacon is still blinking.',
    'Halloran has reduced his rota to two words. Every fifteen minutes he says, "Still here?" and we go round the raft and each person says, "Still here." Fourteen times. Then he says, "Good," and we wait for the next one. It is the stupidest, most important thing I have ever been part of. When it is my turn I say it to the memory card in my pocket as well, under my breath, so no one hears.',
    'I do not know how to end this entry, so I will do what she does. Hour 17: everyone is probably fine.'),

  J(24, 'IV', 'Rescue', 'ashore · two days later',
    'The engines were real the third time. Eighteen hours after we went into the raft, a grey cutter came up out of the grey and someone on it was waving with both arms, and the second fired all three flares one after the other even though they could plainly see us, and nobody told him to stop. They lifted us out one at a time. There were blankets and hot sweet tea and a man with a clipboard who said "Bennets, Maya?" off a list and said it again when I did not answer, because I had forgotten that was me. Priya, Teo, Mags, Halloran, Ortiz, Dede. Fourteen out of the raft. Fourteen.',
    'Then they told us the rest. The barge had come round. Its crew, all of them unhurt, had pulled two people out of the water in the dark: the motorman who swam the other way, and one person who had got off the stern block as it turned over. Sixteen of us came home. Nine did not. I am not going to write their names here. I have written them somewhere better, and I will keep writing them. The survivors from both vessels have already said it to each other and to the people in good coats who came to ask us questions: Horizon should never have been out there. Everyone knew it, and the ship went anyway, and the people who sent her are very sorry now.',
    'Card B is drying on the windowsill. I do not know what I will do with it. There are Skips on every survey ship on this coast; I saw two on the cutter that picked us up, boxy and patient, filming the deck, each of them too big to carry under one arm. They are everywhere, and none of them is her. What we put inside her is on Priya\'s laptop, and Priya\'s laptop is on the bottom, but Priya says she remembers most of it, and Teo has not said what he means to do about that, and none of us has asked. The other half of her is on the bottom somewhere, or drifting, or sitting on a reef with her one eye open, flashing green at fish who do not care. I would like to think she is recording. I would like to think she wrote her line last night, wherever she is. Probably fine. I do not know. I am not even 40% sure. But I said goodnight to her anyway, through the window, out of habit, and I think I will keep doing that for a while.'),
];

export const LOST_JOURNAL_COUNT = LOST_JOURNALS.length;   // 24

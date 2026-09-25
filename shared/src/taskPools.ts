import { RoomType, Task } from './types';

interface RawTask {
  text: string;
  /** A visual task is something a bystander could actually see you do, a stronger alibi. */
  visual: boolean;
}

const raw: Record<RoomType, RawTask[]> = {
  kitchen: [
    { text: 'Wipe down the counter', visual: true },
    { text: 'Fill a glass with water and drink it', visual: true },
    { text: 'Put 3 dishes in the sink or dishwasher', visual: true },
    { text: 'Open the fridge and name 3 items inside', visual: false },
    { text: 'Throw away one piece of trash', visual: true },
    { text: 'Organize the utensil drawer', visual: false },
    { text: 'Wipe down the stovetop', visual: true },
    { text: 'Take out the recycling', visual: true },
    { text: 'Refill the napkin holder', visual: false },
    { text: 'Check the pantry for expired food', visual: false },
    { text: 'Make a piece of toast', visual: true },
    { text: 'Wipe the microwave door', visual: true },
    { text: 'Straighten the chairs at the table', visual: true },
    { text: 'Check if the trash needs to be taken out', visual: false },
    { text: 'Pour yourself a snack in a bowl', visual: true },
    { text: 'Wipe down the kitchen table', visual: true },
    { text: 'Check that the oven is off', visual: false },
    { text: 'Put the condiments back in the fridge door', visual: true },
    { text: 'Fold the dish towel and hang it up', visual: true },
    { text: 'Rinse a dish and place it in the rack', visual: true },
    { text: 'Wipe a fingerprint off the fridge door', visual: true },
    { text: 'Turn the kettle on and then off', visual: true },
    { text: 'Sort the silverware in the drawer', visual: false },
    { text: 'Push a chair back under the table', visual: true },
    { text: 'Squeeze a lemon or lime into a glass of water', visual: true },
  ],
  bathroom: [
    { text: 'Fold the hand towel neatly', visual: true },
    { text: 'Check the toilet paper roll and refill if needed', visual: false },
    { text: 'Wipe down the sink', visual: true },
    { text: 'Straighten the items on the counter', visual: true },
    { text: 'Check under the sink for supplies', visual: false },
    { text: 'Close the shower curtain', visual: true },
    { text: 'Wipe the mirror if it is smudged', visual: true },
    { text: 'Empty the small trash can', visual: true },
    { text: 'Check the soap dispenser level', visual: false },
    { text: 'Line up the toiletries neatly', visual: true },
    { text: 'Wash your hands with soap', visual: true },
    { text: 'Fluff the bathmat', visual: true },
    { text: 'Check that the light works', visual: false },
    { text: 'Straighten the towels on the rack', visual: true },
    { text: 'Close the toilet lid', visual: true },
    { text: 'Check that the toothbrushes are upright in their holder', visual: true },
    { text: 'Wipe down the toilet handle', visual: true },
    { text: 'Refill the hand soap if it is low', visual: false },
    { text: 'Hang up a towel that is on the floor', visual: true },
    { text: 'Close the medicine cabinet if it is open', visual: false },
    { text: 'Wipe a water spot off the faucet', visual: true },
    { text: 'Straighten the shower caddy items', visual: true },
    { text: 'Check the trash can is not overflowing', visual: false },
    { text: 'Spray and wipe the counter by the sink', visual: true },
    { text: 'Turn the exhaust fan on and off', visual: true },
  ],
  'living-room': [
    { text: 'Fluff two couch pillows', visual: true },
    { text: 'Fold a blanket', visual: true },
    { text: 'Straighten the remotes on the table', visual: true },
    { text: 'Pick up 3 stray items off the floor', visual: true },
    { text: 'Dust a visible shelf', visual: true },
    { text: 'Turn a lamp on and back off', visual: true },
    { text: 'Straighten the books on a shelf', visual: true },
    { text: 'Check under the couch cushions for lost items', visual: false },
    { text: 'Wipe down the coffee table', visual: true },
    { text: 'Close the curtains or blinds', visual: true },
    { text: 'Turn the TV on and back off', visual: true },
    { text: 'Line up the shoes by the door', visual: true },
    { text: 'Water a houseplant if there is one', visual: true },
    { text: 'Adjust a crooked picture frame', visual: true },
    { text: 'Sweep a corner of the room', visual: true },
    { text: 'Sweep or vacuum a visible patch of floor', visual: true },
    { text: 'Stack the magazines or mail neatly', visual: true },
    { text: 'Untangle a lamp or charger cord', visual: true },
    { text: 'Wipe down a light switch plate', visual: true },
    { text: 'Check that the thermostat reads a normal temperature', visual: false },
    { text: 'Center the rug under the coffee table', visual: true },
    { text: 'Dust the TV screen with a cloth', visual: true },
    { text: 'Fold the throw blanket over the couch arm', visual: true },
    { text: 'Check the batteries in a remote', visual: false },
    { text: 'Straighten a stack of coasters', visual: true },
  ],
  bedroom: [
    { text: 'Make the bed', visual: true },
    { text: 'Fold three pieces of clothing', visual: true },
    { text: 'Put away one item that is out of place', visual: false },
    { text: 'Straighten items on the nightstand', visual: true },
    { text: 'Open the curtains or blinds', visual: true },
    { text: 'Fluff the pillows', visual: true },
    { text: 'Make sure the closet is closed', visual: false },
    { text: 'Put a book back on the shelf', visual: true },
    { text: 'Plug in a phone charger', visual: true },
    { text: 'Straighten the shoes by the closet', visual: true },
    { text: 'Empty a small trash can', visual: true },
    { text: 'Set an alarm on a clock', visual: false },
    { text: 'Fold the blanket at the foot of the bed', visual: true },
    { text: 'Tidy the top of the dresser', visual: true },
    { text: 'Turn off a light', visual: true },
    { text: 'Hang up a jacket or shirt on a hanger', visual: true },
    { text: 'Close the dresser drawers all the way', visual: true },
    { text: 'Straighten the rug beside the bed', visual: true },
    { text: 'Untangle the phone charger cable', visual: true },
    { text: 'Check that the window is latched', visual: false },
    { text: 'Line up the pillows against the headboard', visual: true },
    { text: 'Put dirty clothes in the hamper', visual: true },
    { text: 'Wipe down the nightstand', visual: true },
    { text: 'Check the closet light turns off', visual: false },
    { text: 'Straighten a picture frame on the wall', visual: true },
  ],
  outdoor: [
    { text: 'Check the mailbox', visual: true },
    { text: 'Pick up 3 pieces of debris from the yard', visual: true },
    { text: 'Check that the porch light works', visual: false },
    { text: 'Straighten a chair or item on the porch', visual: true },
    { text: 'Check if the front door is locked', visual: false },
    { text: 'Water a plant outside', visual: true },
    { text: 'Check that the trash cans are closed', visual: false },
    { text: 'Look for any packages at the door', visual: false },
    { text: 'Check that a nearby car is locked', visual: false },
    { text: 'Coil up a loose hose or cord', visual: true },
    { text: 'Check the mailbox flag', visual: false },
    { text: 'Sweep the front step', visual: true },
    { text: 'Check that the doorbell works', visual: false },
    { text: 'Look up and name a cloud shape or star', visual: false },
    { text: 'Close the gate if there is one', visual: true },
    { text: 'Check that the garage door is closed', visual: false },
    { text: 'Straighten the welcome mat', visual: true },
    { text: 'Pick up a stray leaf or twig near the door', visual: true },
    { text: 'Check the outdoor faucet is not dripping', visual: false },
    { text: 'Wave at the street', visual: true },
    { text: 'Check that the garden hose is off', visual: false },
    { text: 'Straighten a potted plant', visual: true },
    { text: 'Confirm the recycling bin is out or put away', visual: false },
    { text: 'Check that a window screen is intact', visual: false },
    { text: 'Tap the mailbox twice for good luck', visual: true },
  ],
  'any-room': [
    { text: 'Do 10 jumping jacks', visual: true },
    { text: 'Type "task complete" in your notes app', visual: false },
    { text: 'Hum your favorite song for 10 seconds', visual: false },
    { text: 'Find something red and touch it', visual: true },
    { text: 'Do 5 pushups', visual: true },
    { text: 'Balance on one foot for 10 seconds', visual: true },
    { text: 'Find a clock and check the time', visual: false },
    { text: 'Count the windows in the room you are in', visual: false },
    { text: 'Say the alphabet backwards from Z to A', visual: false },
    { text: 'Find something blue and touch it', visual: true },
    { text: 'Do a silly dance for 5 seconds', visual: true },
    { text: 'Check your phone battery percentage', visual: false },
    { text: 'Find a book and read its first line', visual: false },
    { text: 'Snap your fingers 10 times', visual: true },
    { text: 'Look out a window and name what you see', visual: false },
    { text: 'Whistle a tune for 5 seconds', visual: false },
    { text: 'Do 5 squats', visual: true },
    { text: 'Name three colors you can see right now', visual: false },
    { text: 'Touch your toes for 5 seconds', visual: true },
    { text: "Find something starting with your name's first letter and touch it", visual: true },
    { text: 'Spin around once in place', visual: true },
    { text: 'Check the current temperature outside on your phone', visual: false },
    { text: 'Find a pen and click it 5 times', visual: true },
    { text: "Recite today's date out loud", visual: false },
    { text: 'Wiggle your fingers above your head for 5 seconds', visual: true },
  ],
};

export const ROOM_TYPES = Object.keys(raw) as RoomType[];

export const ALL_TASKS: Task[] = ROOM_TYPES.flatMap((room) =>
  raw[room].map((t, i) => ({ id: `${room}-${i}`, room, text: t.text, visual: t.visual }))
);

/**
 * The "swipe card" of IRL Impostor: one of these is dealt to every single
 * player each game, crew and impostor alike, as an extra task on top of
 * their usual list. Everyone doing the same, quick, unmistakably visual
 * action means a player who's clearly never done it (or fakes it wrong)
 * stands out.
 */
const rawCommon: (RawTask & { room: RoomType })[] = [
  { text: 'Grab a square of toilet paper and hold it up like a boarding pass', visual: true, room: 'bathroom' },
  { text: 'Find the TV remote and hold it up like a wand', visual: true, room: 'living-room' },
  { text: 'Open the fridge and hold up the closest item', visual: true, room: 'kitchen' },
  { text: 'Grab a sock and hold it up like a hand puppet', visual: true, room: 'bedroom' },
  { text: 'Step outside or to a window and give a thumbs up', visual: true, room: 'outdoor' },
  { text: 'Hold your phone charger up like a trophy', visual: true, room: 'any-room' },
  { text: 'Grab a shoe and hold it up like you are inspecting it', visual: true, room: 'any-room' },
  { text: 'Find a pillow and hold it up over your head', visual: true, room: 'living-room' },
];

export const COMMON_TASKS: Task[] = rawCommon.map((t, i) => ({
  id: `common-${i}`,
  room: t.room,
  text: t.text,
  visual: t.visual,
}));

export const MAX_CUSTOM_TASKS = 20;
export const MAX_CUSTOM_TASK_LENGTH = 80;

/** Turns the host's typed-in task text into Task objects for the assignment pool. */
export function buildCustomTasks(customTaskTexts: string[]): Task[] {
  return customTaskTexts.map((text, i) => ({
    id: `custom-${i}`,
    room: 'any-room',
    text,
    visual: false,
  }));
}

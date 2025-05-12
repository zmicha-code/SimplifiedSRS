import {
  Card,
  declareIndexPlugin,
  QueueInteractionScore,
  ReactRNPlugin,
  RepetitionStatus,
  SpecialPluginCallback,
  RemId,
  WidgetLocation,
  AppEvents,
  RichTextInterface,
  RNPlugin,
  Rem,
  RemType,
  Queue
} from '@remnote/plugin-sdk';

//import { getLastInterval, getWrongInRow } from './customQueueWidget';
import '../style.css';
import '../App.css';
import { Console } from 'console';

// Constants for time in milliseconds
const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

const DEFAULT_AGAIN = 30 * MS_PER_MINUTE;
const DEFAULT_HARD = 12 * MS_PER_HOUR;
const DEFAULT_GOOD = 2 * MS_PER_DAY;
const DEFAULT_EASY = 4 * MS_PER_DAY;

export function getTimestamp(date: Date | number): number {
  return typeof date === 'number' ? date : date.getTime();
}

// -> index.tsx
/*
export function getLastRecordedInterval_(history: RepetitionStatus[] | undefined): number {
  
  //
  if (!history || history.length === 0) return 0;

  //console.log("History Length: " + history.length);

  // Filter out TOO_EARLY scores
  const filteredHistory = history.filter(rep => rep.score !== QueueInteractionScore.TOO_EARLY);

  //console.log("Filtered History Length: " + filteredHistory.length);

  // Find the index of the last RESET or AGAIN
  let lastRestartIndex = -1;
  for (let i = filteredHistory.length - 1; i >= 0; i--) {
    if (filteredHistory[i].score === QueueInteractionScore.RESET || filteredHistory[i].score === QueueInteractionScore.AGAIN) { //  || filteredHistory[i].score === QueueInteractionScore.AGAIN
      lastRestartIndex = i;
      break;
    }
  }

  // Consider history after the last restart
  const relevantHistory = lastRestartIndex === -1 ? filteredHistory : filteredHistory.slice(lastRestartIndex + 1); // + 1

  //console.log("Relevant History Length: " + relevantHistory.length);

  if (relevantHistory.length < 2) return 0; // Need at least 2 reps for a recorded interval

  const cardX = relevantHistory[relevantHistory.length - 1]; // Last valid repetition
  const cardXMinus1 = relevantHistory[relevantHistory.length - 2]; // Second-to-last valid repetition

  // 
  if(cardXMinus1.score == QueueInteractionScore.AGAIN)
    return getLastIntervalBeforeAgain(history);

  if (cardX.scheduled !== undefined) {
    return cardX.scheduled - getTimestamp(cardXMinus1.date);
  }

  return 0; // Return 0 if scheduled is missing
}
  */

export function getLastRecordedInterval(history: RepetitionStatus[] | undefined): number {
  if (!history || history.length < 2) return 0;

  // Find the index of the last RESET
  let lastResetIndex = -1;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].score === QueueInteractionScore.RESET) {
      lastResetIndex = i;
      break;
    }
  }

  // Consider history after the last RESET
  const relevantHistory = lastResetIndex === -1 ? history : history.slice(lastResetIndex + 1);

  if (relevantHistory.length < 2) return 0;

  // Define type A and type B
  function isTypeA(score: QueueInteractionScore): boolean {
    return (
      score === QueueInteractionScore.HARD ||
      score === QueueInteractionScore.GOOD ||
      score === QueueInteractionScore.EASY
    );
  }

  function isTypeB(score: QueueInteractionScore): boolean {
    return (
      score === QueueInteractionScore.TOO_EARLY ||
      score === QueueInteractionScore.AGAIN
    );
  }

  // Check the last two elements
  const lastIndex = relevantHistory.length - 1;
  const secondLastIndex = lastIndex - 1;
  const lastScore = relevantHistory[lastIndex].score;
  const secondLastScore = relevantHistory[secondLastIndex].score;

  if (isTypeA(lastScore) && isTypeA(secondLastScore)) {
    const cardX = relevantHistory[lastIndex];
    const cardXMinus1 = relevantHistory[secondLastIndex];
    if (cardX.scheduled !== undefined) {
      return cardX.scheduled - getTimestamp(cardXMinus1.date);
    }
    return 0;
  }

  // Find the last type B not preceded by another type B
  let typeBIndex = -1;
  for (let i = relevantHistory.length - 1; i >= 0; i--) {
    if (isTypeB(relevantHistory[i].score) && (i === 0 || !isTypeB(relevantHistory[i - 1].score))) {
      typeBIndex = i;
      break;
    }
  }

  if (typeBIndex === -1) return 0; // No suitable type B found

  // Find the previous type A before the type B
  let typeAIndex = -1;
  for (let i = typeBIndex - 1; i >= 0; i--) {
    if (isTypeA(relevantHistory[i].score)) {
      typeAIndex = i;
      break;
    }
  }

  if (typeAIndex === -1) return 0; // No type A before type B

  // Calculate interval
  const cardX = relevantHistory[typeBIndex];
  const cardXMinus1 = relevantHistory[typeAIndex];
  if (cardX.scheduled !== undefined) {
    return cardX.scheduled - getTimestamp(cardXMinus1.date);
  }
  return 0;
}

function isInRecovery(history: RepetitionStatus[]): boolean {
  for (let i = history.length - 1; i >= 0; i--) {
      const score = history[i].score;
      if (score !== QueueInteractionScore.TOO_EARLY) {
          return score === QueueInteractionScore.AGAIN;
      }
  }
  return false; // All scores are TOO_EARLY or history is empty
}

export function getWrongInRow(history: RepetitionStatus[]) : number {
  let t = 0

  // 
  if(history.length < 1)
    return t;

  for (let i = history.length - 2; i >= 0; i--) {
    if (history[i].score === QueueInteractionScore.AGAIN || history[i].score === QueueInteractionScore.TOO_EARLY) {
      if(history[i].score === QueueInteractionScore.AGAIN)
        t++;
    } else {
        break;
    }
}

  return t;
}

export function getLastInterval(history: RepetitionStatus[] | undefined): number {
  // New Card
  if (!history || history.length === 0) return 0;

  const lastRep = history[history.length - 1];

  let lastRecordedInterval = getLastRecordedInterval(history);

  // Recalculate Current Working Interval From Recorded Interval and Last Score
  let currentInterval: number = 0;

  switch (lastRep.score) {
    case QueueInteractionScore.RESET:
      currentInterval = 0;
      break;
      case QueueInteractionScore.TOO_EARLY:
      case QueueInteractionScore.AGAIN:
      //currentInterval = 30 * MS_PER_MINUTE; // 30 minutes
      //console.log("HELLO?");
      currentInterval = lastRecordedInterval; //getLastIntervalBeforeAgain(history);
      break;

    //case QueueInteractionScore.TOO_EARLY:
    case QueueInteractionScore.HARD:
    case QueueInteractionScore.GOOD:
    case QueueInteractionScore.EASY:
      // A
      // RECOVER FROM AGAIN: Recalculate after 2nd try
      // TODO: function isInRecovery -> there could be TOO_EARLY after the inital AGAIN, e.g. A A AGAIN TOO_EARLY TOO_EARLY
      //const prevRep = history[history.length-2];
      //if(prevRep && prevRep.score == QueueInteractionScore.AGAIN) {
      if(isInRecovery(history.slice(0, -1))) {
        const wrongInRow = getWrongInRow(history.slice(0, -1));
        //lastRecordedInterval = getLastIntervalBeforeAgain(history);
        const denominators: { [key in QueueInteractionScore]?: number } = {
          [QueueInteractionScore.HARD]: wrongInRow + 3,
          [QueueInteractionScore.GOOD]: wrongInRow + 2,
          [QueueInteractionScore.EASY]: wrongInRow + 1,
        };
        currentInterval = Math.max(DEFAULT_HARD, lastRecordedInterval / (denominators[lastRep.score] || 1));
        break;
      }
      //console.log("New Interval would be " + formatMilliseconds(lastInterval / (denominators[currentRep.score] || 1)));

      // B
      // 1 Card in History. Recalculate Interval
      // It was the first Card. Use fixed values
      if(lastRecordedInterval == 0) {
        if (lastRep.score === QueueInteractionScore.HARD) {
          currentInterval = 12 * MS_PER_HOUR; // 12 hours
        } else if (lastRep.score === QueueInteractionScore.GOOD) {
          currentInterval = 2 * MS_PER_DAY; // 2 days
        } else if (lastRep.score === QueueInteractionScore.EASY){
          currentInterval = 4 * MS_PER_DAY; // 4 days
        }
      } else {
        // C
        // Combine last interval with score
        const multipliers: { [key in QueueInteractionScore]?: number } = {
          [QueueInteractionScore.HARD]: 0.75, // Reduce interval
          [QueueInteractionScore.GOOD]: 1.5,  // Increase moderately
          [QueueInteractionScore.EASY]: 3,    // Increase significantly
        };
        currentInterval = lastRecordedInterval * (multipliers[lastRep.score] || 1);
        currentInterval = Math.max(currentInterval, 6 * MS_PER_HOUR); // Minimum 6 hours
      }

      break;

    default:
      currentInterval = 1 * MS_PER_DAY; // Default: 1 day
      break;
  }

  console.log("Last Recorded Working Interval: " + formatMilliseconds(lastRecordedInterval) + " Current Working Interval: " + formatMilliseconds(currentInterval));

  return currentInterval;
}

/*
export function getLastIntervalBeforeAgain(history: RepetitionStatus[] | undefined): number {
  // Step 1: Validate input
  if (!history || history.length < 2) return DEFAULT_AGAIN;

  // Step 2: Filter out irrelevant scores (e.g., TOO_EARLY)
  const filteredHistory = history.filter(rep => rep.score !== QueueInteractionScore.TOO_EARLY);

  // Step 3: Find the last AGAIN not preceded by another AGAIN
  let lastAgainIndex = -1;
  for (let i = filteredHistory.length - 1; i >= 0; i--) {
    if (filteredHistory[i].score === QueueInteractionScore.AGAIN &&
        (i === 0 || filteredHistory[i - 1].score !== QueueInteractionScore.AGAIN)) {
      lastAgainIndex = i;
      break;
    }
  }

  // If no valid AGAIN is found, return 0
  if (lastAgainIndex === -1) return DEFAULT_AGAIN;

  // Step 4: Find the previous HARD, GOOD, or EASY
  let previousValidIndex = -1;
  for (let i = lastAgainIndex - 1; i >= 0; i--) {
    const score = filteredHistory[i].score;
    if (score === QueueInteractionScore.HARD|| score === QueueInteractionScore.GOOD|| score === QueueInteractionScore.EASY) {
      previousValidIndex = i;
      break;
    }
  }

  // If no previous valid score is found, return 0
  if (previousValidIndex === -1) return DEFAULT_AGAIN;

  // Step 5: Calculate the interval
  const againRep = filteredHistory[lastAgainIndex];
  const previousValid = filteredHistory[previousValidIndex];
  if (againRep.scheduled !== undefined) {
    return againRep.scheduled - getTimestamp(previousValid.date);
  }

  return DEFAULT_AGAIN; // Return 0 if scheduled is missing
}
  */

export function formatMilliseconds(ms : number): string {
  if (ms === 0) return '0 seconds'; // Special case for zero
  if (ms < 0) ms = Math.abs(ms);    // Handle negatives with absolute value

  const millisecondsInSecond = 1000;
  const millisecondsInMinute = millisecondsInSecond * 60;
  const millisecondsInHour = millisecondsInMinute * 60;
  const millisecondsInDay = millisecondsInHour * 24;

  let value, unit;

  if (ms >= millisecondsInDay) {
      value = ms / millisecondsInDay;
      unit = 'day';
  } else if (ms >= millisecondsInHour) {
      value = ms / millisecondsInHour;
      unit = 'hour';
  } else if (ms >= millisecondsInMinute) {
      value = ms / millisecondsInMinute;
      unit = 'minute';
  } else if (ms >= millisecondsInSecond) {
      value = ms / millisecondsInSecond;
      unit = 'second';
  } else {
      value = ms;
      unit = 'millisecond';
  }

  // Round to 2 decimal places for clean output
  value = Math.round(value * 100) / 100;

  // Pluralize unit if value isn’t 1
  const plural = value !== 1 ? 's' : '';
  //return `${value} ${unit}${plural}`;
  return value + " " + unit + plural;
} 

// -> utils
async function processRichText(plugin: RNPlugin, richText: RichTextInterface, showAlias = false): Promise<string> {
  const textPartsPromises = richText.map(async (item) => {
    if (typeof item === "string") {
      return item;
    }
    switch (item.i) {
      case 'm': return item.text;
      case 'q':
        const id = showAlias && item.aliasId ? item.aliasId : item._id;
      
        //const referencedRem = await plugin.rem.findOne(item._id);
        const referencedRem = await plugin.rem.findOne(id);
        if (referencedRem) {
          return await getRemText(plugin, referencedRem);
        } else if (item.textOfDeletedRem) {
          return await processRichText(plugin, item.textOfDeletedRem);
        }
        return "";
      case 'i': return item.url;
      case 'a': return item.url;
      case 'p': return item.url;
      case 'g': return item._id || "";
      case 'x': return item.text;
      case 'n': return item.text;
      case 's': return "";
      default: return "";
    }
  });

  const textParts = await Promise.all(textPartsPromises);
  return textParts.join("");
}

// -> utils
export async function getRemText(plugin: RNPlugin, rem: Rem, extentedName = false): Promise<string> {
  if (!rem) return "";

  let richText = rem.text;

  const textPartsPromises = richText ? richText.map(async (item) => {
    if (typeof item === "string") {
      if(extentedName && await rem.getType() == RemType.DESCRIPTOR) {
        const parentRem = await rem.getParentRem();

        if(parentRem)
            return await getRemText(plugin, parentRem) + ">" + item;
      }
      return item;
    }
    switch (item.i) {
      //case 'm': return item.text;
      case 'q':
        const referencedRem = await plugin.rem.findOne(item._id);
        if (referencedRem) {
          if(extentedName) {
            const refParentRem = await rem.getParentRem();

            if(refParentRem)
              return await getRemText(plugin, refParentRem, true) + ">" + await getRemText(plugin, referencedRem);
          }

          return await getRemText(plugin, referencedRem);
        } else if (item.textOfDeletedRem) {
          return await processRichText(plugin, item.textOfDeletedRem);
        }
        return "";
      case 'i': return item.url;
      case 'a': return item.url;
      case 'p': return item.url;
      case 'g': return item._id || "";
      case 'm':
      case 'x': 
      case 'n':
        // 
        if(extentedName && await rem.getType() == RemType.DESCRIPTOR) {
            const parentRem = await rem.getParentRem();

            if(parentRem)
                return await getRemText(plugin, parentRem) + ">" + item.text;
        }
        return item.text;
      //case 'n': return item.text;
      case 's': return "";
      default: return "";
    }
  }) : [];

  const textParts = await Promise.all(textPartsPromises);
  return textParts.join("");
  //return processRichText(plugin, rem.text);
}

async function onActivate(plugin: ReactRNPlugin) {

  await plugin.scheduler.registerCustomScheduler('SimplifiedSRS', []);

  //
  plugin.event.addListener(AppEvents.QueueLoadCard, undefined, 
    async function onQueueLoadCard(event: any) {
      //console.log("QueueLoadCard event: ", event);
    
      if(event.cardId) {
        await plugin.storage.setSynced("currentQueueCardId", event.cardId);

        //
        /*
        const c = await plugin.card.findOne(event.cardId);

        if(c) {
          //console.log("Card Loaded: " + await getRemText(plugin, await c.getRem() as Rem))

          
          if(c.repetitionHistory) {
            const r = c.repetitionHistory;
            const _r = c.repetitionHistory[c.repetitionHistory.length-1];

            console.log("Number of Repetitions: " + c.repetitionHistory.length);
            console.log("Last Score: " + _r.score);
            console.log("Today: " + formatMilliseconds(Date.now()))
            console.log("Date: " + formatMilliseconds(getTimestamp(_r.date as number)));
            console.log("Scheduled: " + formatMilliseconds(getTimestamp(_r.scheduled as number)));

            //const dummyAnswer: RepetitionStatus = {date: Date.now(), score: QueueInteractionScore.TOO_EARLY, scheduled: getLastInterval(r)};

            // const currentRepetition = [...c.repetitionHistory, ...[dummyAnswer]];

            console.log("Last Interval: " + formatMilliseconds(getLastInterval_(c.repetitionHistory)));
          }
        }
          */
      }
    }
  );
  //
  await plugin.app.registerCallback<SpecialPluginCallback.SRSScheduleCard>(
    SpecialPluginCallback.SRSScheduleCard,
    getNextSpacingDate
  );

  await plugin.app.registerWidget('customQueueWidget', WidgetLocation.RightSidebar, {
    dimensions: { height: 'auto', width: '100%' },
    widgetTabIcon: "https://i.imgur.com/nGwgOpN.png"
  });

  // definitions

  let currentCardId: string;
  let currentCardRepetitions: number;

  async function getNextSpacingDate(args: {
                                    history: RepetitionStatus[];
                                    schedulerParameters: Record<string, unknown>;
                                    cardId: string | undefined;}) : Promise<{ nextDate: number, pluginData?: Record<string, any> }> {

    // Save CardID for widget
    //await plugin.storage.setSynced("currentQueueCardId", args.cardId);

    // Algorithm
    const { history } = args;

    // The last repetition is the current answer
    const currentRep = history[history.length - 1];

    // REMNOTE CALLS THIS MULTIPLE TIMES UNDER DIFFERENT SCENARIOS. CHECKING THIS FIXES ISSUES
    if(currentRep.score == QueueInteractionScore.AGAIN && currentCardId != args.cardId) {
      //console.log("Start of a new Card");
      currentCardId = args.cardId ? args.cardId : "0";
      currentCardRepetitions = history.length;
    }

    const isPreview = currentCardRepetitions == history.length ? true : false;

    const lastWorkingInterval = isPreview && !(currentRep.score == QueueInteractionScore.AGAIN) ? getLastInterval(history.slice(0, -1)) : getLastInterval(history); // getLastInterval(repHistory); //

    //console.log("Last Interval: " + formatMilliseconds(lastInterval));

    let nextInterval: number;

    switch (currentRep.score) {
        case QueueInteractionScore.TOO_EARLY:
        case QueueInteractionScore.VIEWED_AS_LEECH:
            // Fixed interval of 30 minutes
            nextInterval = DEFAULT_AGAIN; // Remnote sets this to 1h 
            break;

        case QueueInteractionScore.AGAIN:
            // Fixed interval of 1 hour
            nextInterval = DEFAULT_AGAIN; //1 * MS_PER_HOUR;
            break;

        case QueueInteractionScore.RESET:
            // Reset to a default interval of 1 day
            //nextInterval = 1 * MS_PER_DAY;
            nextInterval = 0;
            break;

        case QueueInteractionScore.HARD:
        case QueueInteractionScore.GOOD:
        case QueueInteractionScore.EASY:
          // This is a new Card
          if (lastWorkingInterval === 0) {
              // Fixed intervals for new cards or after reset
              if (currentRep.score === QueueInteractionScore.HARD) {
                nextInterval = DEFAULT_HARD; // 12 hours
              } else if (currentRep.score === QueueInteractionScore.GOOD) {
                nextInterval = DEFAULT_GOOD; // 2 days
              } else { // EASY
                nextInterval = DEFAULT_EASY; // 4 days
              }
          } else {
            // Not a new Card
            const wrongInRow = getWrongInRow(history);

            // 
            if (wrongInRow === 0) {
              const multipliers: { [key in QueueInteractionScore]?: number } = {
                  [QueueInteractionScore.HARD]: 0.75,
                  [QueueInteractionScore.GOOD]: 1.5,
                  [QueueInteractionScore.EASY]: 3,
              };
              nextInterval = Math.max(DEFAULT_HARD, lastWorkingInterval * (multipliers[currentRep.score] || 1)); // At leat the default value for a new card that was hard.
            } else {
              // Previously Failed Card
              // Reduce interval based on number of consecutive AGAIN scores
              const denominators: { [key in QueueInteractionScore]?: number } = {
                  [QueueInteractionScore.HARD]: wrongInRow + 3,
                  [QueueInteractionScore.GOOD]: wrongInRow + 2,
                  [QueueInteractionScore.EASY]: wrongInRow + 1,
              };
              //console.log("New Interval would be " + formatMilliseconds(lastInterval / (denominators[currentRep.score] || 1)));

              nextInterval = Math.max(DEFAULT_HARD, lastWorkingInterval / (denominators[currentRep.score] || 1));
            }
            
            // 6 h for old cards
            //nextInterval = Math.max(nextInterval, 6 * MS_PER_HOUR);
          }

          // Ensure minimum interval of 1 hour for skip and again
          //nextInterval = Math.max(nextInterval, 1 * MS_PER_HOUR);

          break;

        default:
            // Fallback for unexpected scores
            nextInterval = DEFAULT_HARD;
            break;
    }

    // Apply ±20% randomization
    //const randomization = (Math.random() - 0.5) * 0.4; // -0.2 to 0.2
    //nextInterval = nextInterval * (1 + randomization);

    const nextDate = Date.now() + nextInterval; //  MS_PER_DAY * 5;//

    //
    //const pluginData: Record<string, any> = {
    //  "IntervalTransition" :  `${lastInterval}->${nextInterval}`
    //};

    //console.log((args.cardId ? args.cardId : "") + (isPreview ? "(Preview)" : "" + ": Interval: ") + formatMilliseconds(lastInterval) + " -> " + formatMilliseconds(nextInterval), currentRep.score);

    //return { nextDate, pluginData};
    return { nextDate };
  }

  async function getNextSpacingDate_(args: {
    history: RepetitionStatus[];
    schedulerParameters: Record<string, unknown>;
    cardId: string | undefined;}) : Promise<{ nextDate: number }> {

    //
    await plugin.storage.setSynced("currentQueueCardId", args.cardId);

    const { history } = args;
    const currentRep = history[history.length - 1];
    const lastInterval = getLastInterval(history);

    // Constants for time in milliseconds
    const MS_PER_MINUTE = 60 * 1000;
    const MS_PER_HOUR = 60 * MS_PER_MINUTE;
    const MS_PER_DAY = 24 * MS_PER_HOUR;

    let nextInterval: number;

    switch (currentRep.score) {
    case QueueInteractionScore.TOO_EARLY:
    case QueueInteractionScore.VIEWED_AS_LEECH:
    // Fixed interval of 30 minutes, no randomization
    nextInterval = 30 * MS_PER_MINUTE; // Remnote sets this to 1h 
    break;

    case QueueInteractionScore.AGAIN:
    // Fixed interval of 1 hour, no randomization
    nextInterval = 30 * MS_PER_MINUTE; //1 * MS_PER_HOUR;
    break;

    case QueueInteractionScore.RESET:
    // Reset to a default interval of 1 day, no randomization
    //nextInterval = 1 * MS_PER_DAY;
    nextInterval = 0;
    break;

    case QueueInteractionScore.HARD:
    case QueueInteractionScore.GOOD:
    case QueueInteractionScore.EASY:
    let baseInterval: number;
    if (lastInterval === 0) {
    // Fixed intervals for new cards or after reset
    if (currentRep.score === QueueInteractionScore.HARD) {
    baseInterval = 12 * MS_PER_HOUR; // 12 hours
    } else if (currentRep.score === QueueInteractionScore.GOOD) {
    baseInterval = 2 * MS_PER_DAY; // 2 days
    } else { // EASY
    baseInterval = 4 * MS_PER_DAY; // 4 days
    }
    } else {
    // Adjust interval based on score and consecutive wrong answers
    const wrongInRow = getWrongInRow(history);
    if (wrongInRow === 0) {
    // No consecutive AGAIN scores
    const multipliers: { [key in QueueInteractionScore]?: number } = {
    [QueueInteractionScore.HARD]: 0.75,
    [QueueInteractionScore.GOOD]: 1.5,
    [QueueInteractionScore.EASY]: 3,
    };
    baseInterval = lastInterval * (multipliers[currentRep.score] || 1);
    } else {
    // Reduce interval based on number of consecutive AGAIN scores
    const denominators: { [key in QueueInteractionScore]?: number } = {
    [QueueInteractionScore.HARD]: wrongInRow + 3,
    [QueueInteractionScore.GOOD]: wrongInRow + 2,
    [QueueInteractionScore.EASY]: wrongInRow + 1,
    };
    baseInterval = lastInterval / (denominators[currentRep.score] || 1);
    }

    // 6 h for old cards
    baseInterval = Math.max(baseInterval, 6 * MS_PER_HOUR);
    }
    // Apply ±20% randomization
    const randomization = (Math.random() - 0.5) * 0.4; // -0.2 to 0.2
    nextInterval = baseInterval * (1 + randomization);

    // Ensure minimum interval of 1 hour for skip and again
    nextInterval = Math.max(nextInterval, 1 * MS_PER_HOUR);
    break;

    default:
    // Fallback for unexpected scores
    nextInterval = 1 * MS_PER_DAY;
    break;
    }

    const nextDate = Date.now() + nextInterval;
    return { nextDate };
}
}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);

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

function formatTimeStamp(timestamp: number): string {
  const date = new Date(timestamp); // No * 1000 needed
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0'); // +1 because getMonth() is 0-based
  const year = date.getFullYear().toString();
  return `${day}.${month}.${year}`;
}

export function getTimestamp(date: Date | number): number {
  return typeof date === 'number' ? date : date.getTime();
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

export function getLastInterval(history: RepetitionStatus[] | undefined): {workingInterval: number, intervalSetOn: number} | undefined {
  if (!history || history.length === 0) {
      return undefined;
  }

  for (let i = history.length - 1; i >= 0; i--) {
      const repetition = history[i];
      if (repetition.pluginData && typeof repetition.pluginData.workingInterval === 'number' && typeof repetition.pluginData.intervalSetOn === 'number') {
          return { workingInterval: repetition.pluginData.workingInterval , intervalSetOn: repetition.pluginData.intervalSetOn};
      }
  }

  return undefined;
}

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

  let currentCard: Card | undefined;

  await plugin.scheduler.registerCustomScheduler('SimplifiedSRS', []);

  //
  plugin.event.addListener(AppEvents.QueueLoadCard, undefined, 
    async function onQueueLoadCard(event: any) {
    
      if(event.cardId) {
        //currentCard = await plugin.card.findOne(event.cardId);

        // Provide Information For Widget
        await plugin.storage.setSynced("currentQueueCardId", event.cardId);
        //const lastInterval = getLastInterval(currentCard?.repetitionHistory)
        //if(lastInterval) {
        //  await plugin.storage.setSynced("currentQueueCardInterval", lastInterval.workingInterval);
        //  await plugin.storage.setSynced("currentQueueCardDate", lastInterval.intervalSetOn + lastInterval.workingInterval);
        //  await plugin.storage.setSynced("currentQueueCardRating", getLastRatingStr(currentCard?.repetitionHistory));
        //}
      }
    }
  );

  plugin.event.addListener(AppEvents.QueueCompleteCard, undefined,
    async function onQueueCompleteCard(event: any) {
      const cardId = event.cardId as string;
  
      // Fetch the card
      const card = await plugin.card.findOne(cardId);
  
      if (card && card.repetitionHistory && card.repetitionHistory.length > 0) {
        const lastScore = card.repetitionHistory[card.repetitionHistory.length - 1].score;
  
        if (
          lastScore === QueueInteractionScore.HARD ||
          lastScore === QueueInteractionScore.GOOD ||
          lastScore === QueueInteractionScore.EASY
        ) {
          // Get the current array from storage
          const currentQueueCardIds: string[] = (await plugin.storage.getSynced("currentQueueCardIds")) || [];
  
          // Remove the cardId from the array
          const updatedQueueCardIds = currentQueueCardIds.filter(id => id !== cardId);
  
          // Save the updated array back to storage
          await plugin.storage.setSynced("currentQueueCardIds", updatedQueueCardIds);
        }
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

  // Apply ±10% randomization
  function addRandomization(x: number): number {
    const randomization = (Math.random() - 0.5) * 0.2; // -0.1 to 0.1
    return x * (1 + randomization);
  }

  async function getNextSpacingDate(args: {
                                    history: RepetitionStatus[];
                                    schedulerParameters: Record<string, unknown>;
                                    cardId: string | undefined;}) : Promise<{ nextDate: number, pluginData?: Record<string, any> }> {

    //
    await plugin.storage.setSynced("currentQueueCardId", args.cardId);

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

    const lastInterval = getLastInterval(history);

    const lastWorkingInterval = lastInterval ? lastInterval.workingInterval : 0;

    //console.log("Last Interval: " + formatMilliseconds(lastInterval));

    let nextInterval: number;

    switch (currentRep.score) {
        case QueueInteractionScore.TOO_EARLY:
        case QueueInteractionScore.VIEWED_AS_LEECH:
            // Remnote Fixed interval of 60 minutes
            //nextInterval = DEFAULT_AGAIN; // Remnote sets this to 1h 
            if(lastInterval)
              return { nextDate: Date.now() + DEFAULT_AGAIN, pluginData: { workingInterval: lastInterval.workingInterval, intervalSetOn: lastInterval.intervalSetOn} };
            else // TODO
              nextInterval = DEFAULT_AGAIN;
            break;

        case QueueInteractionScore.AGAIN:
            // Remnote Fixed interval of 30 hour
            if(lastInterval)
              return { nextDate: Date.now() + DEFAULT_AGAIN, pluginData: { workingInterval: lastInterval.workingInterval, intervalSetOn: lastInterval.intervalSetOn} };
            else // TODO
              nextInterval = DEFAULT_AGAIN;
            break;

        case QueueInteractionScore.RESET:
          return { nextDate: Date.now() + DEFAULT_AGAIN, pluginData: { workingInterval: 0, intervalSetOn: 0} };
          break;

        case QueueInteractionScore.HARD:
        case QueueInteractionScore.GOOD:
        case QueueInteractionScore.EASY:

          // This is a new Card
          if (lastWorkingInterval === 0) {
              // Fixed intervals for new cards or after reset
              if (currentRep.score === QueueInteractionScore.HARD) {
                //nextInterval = DEFAULT_HARD; // 12 hours
                return { nextDate: Date.now() + DEFAULT_HARD, pluginData: { workingInterval: DEFAULT_HARD, intervalSetOn: Date.now()} };
              } else if (currentRep.score === QueueInteractionScore.GOOD) {
                //nextInterval = DEFAULT_GOOD; // 2 days
                return { nextDate: Date.now() + DEFAULT_GOOD, pluginData: { workingInterval: DEFAULT_GOOD, intervalSetOn: Date.now()} };
              } else { // EASY
                //nextInterval = DEFAULT_EASY; // 4 days
                return { nextDate: Date.now() + DEFAULT_EASY, pluginData: { workingInterval: DEFAULT_EASY, intervalSetOn: Date.now()} };
              }
          }

          // Not a new Card
          const wrongInRow = getWrongInRow(history);

          // Regular Progression
          if (wrongInRow === 0) {
            const multipliers: { [key in QueueInteractionScore]?: number } = {
                [QueueInteractionScore.HARD]: 0.75,
                [QueueInteractionScore.GOOD]: 1.5,
                [QueueInteractionScore.EASY]: 3,
            };
            nextInterval = Math.max(DEFAULT_HARD, lastWorkingInterval * (multipliers[currentRep.score] || 1)); // At leat the default value for a new card that was hard.
            nextInterval = addRandomization(nextInterval);
            return { nextDate: Date.now() + nextInterval, pluginData: { workingInterval: nextInterval, intervalSetOn: Date.now()} };
          }

          // Previously Failed Card
          // Reduce interval based on number of consecutive AGAIN scores
          const denominators: { [key in QueueInteractionScore]?: number } = {
              [QueueInteractionScore.HARD]: wrongInRow + 3,
              [QueueInteractionScore.GOOD]: wrongInRow + 2,
              [QueueInteractionScore.EASY]: wrongInRow + 1,
          };

          nextInterval = Math.max(DEFAULT_HARD, lastWorkingInterval / (denominators[currentRep.score] || 1));
          nextInterval = addRandomization(nextInterval);
          return { nextDate: Date.now() + nextInterval, pluginData: { workingInterval: nextInterval, intervalSetOn: Date.now()} };

          break;

        default:
          // Fallback for unexpected scores
          nextInterval = DEFAULT_HARD;
          break;
    }

    return { nextDate: Date.now() + nextInterval, pluginData: { workingInterval: nextInterval, intervalSetOn: Date.now()} };
  }
}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);

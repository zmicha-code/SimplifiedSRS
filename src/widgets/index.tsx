import {
  Card,
  declareIndexPlugin,
  QueueInteractionScore,
  ReactRNPlugin,
  RepetitionStatus,
  SpecialPluginCallback,
  RemId,
  WidgetLocation,
  AppEvents
} from '@remnote/plugin-sdk';
import '../style.css';
import '../App.css';

async function onActivate(plugin: ReactRNPlugin) {

  //console.log("BetterQ: Plugin activated");

  await plugin.scheduler.registerCustomScheduler('SimplifiedSRS', []);
  //
  await plugin.app.registerCallback<SpecialPluginCallback.SRSScheduleCard>(
    SpecialPluginCallback.SRSScheduleCard,
    getNextSpacingDate
  );

  // definitions
  async function getNextSpacingDate(args: {
                                    history: RepetitionStatus[];
                                    schedulerParameters: Record<string, unknown>;
                                    cardId: string | undefined;}) : Promise<{ nextDate: number }> {
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

  function getWrongInRow(history: RepetitionStatus[]) : number {
    let t = 0

    // 
    if(history.length < 1)
      return t;

    for (let i = history.length - 2; i >= 0; i--) {
      if (history[i].score === QueueInteractionScore.AGAIN) {
          t++;
      } else {
          break;
      }
  }

    return t;
  }

  function getTimestamp(date: Date | number): number {
    return typeof date === 'number' ? date : date.getTime();
  }

  function getLastInterval(history: RepetitionStatus[]): number {
    let lastValidScheduled: number | undefined; // Most recent HARD, GOOD, EASY, or AGAIN
    let secondLastPracticed: number | undefined; // Most recent preceding HARD, GOOD, or EASY
    let foundAgainBetween = false;
  
    // Iterate from most recent to oldest
    for (let i = history.length - 1; i >= 0; i--) {
      const current = history[i];
      const score = current.score;
  
      // Stop at RESET
      if (score === QueueInteractionScore.RESET) {
        return 0;
      }
  
      // Skip TOO_EARLY
      if (score === QueueInteractionScore.TOO_EARLY) {
        continue;
      }
  
      // Handle AGAIN
      if (score === QueueInteractionScore.AGAIN) {
        if (!lastValidScheduled) {
          lastValidScheduled = current.scheduled; // Set as lastValidScheduled
          foundAgainBetween = false;
        } else {
          foundAgainBetween = true; // AGAIN between valid repetitions
        }
        continue;
      }
  
      // Handle HARD, GOOD, EASY
      if (
        score === QueueInteractionScore.HARD ||
        score === QueueInteractionScore.GOOD ||
        score === QueueInteractionScore.EASY
      ) {
        if (!lastValidScheduled) {
          lastValidScheduled = current.scheduled; // First valid score encountered
          foundAgainBetween = false;
        } else if (!foundAgainBetween) {
          secondLastPracticed = getTimestamp(current.date); // Second valid score
          return lastValidScheduled - secondLastPracticed; // Calculate interval
        }
      }
    }
  
    // Return 0 if no valid interval is found
    return 0;
  }

  function formatMilliseconds(ms : number) {
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
    return `${value} ${unit}${plural}`;
  } 
}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);

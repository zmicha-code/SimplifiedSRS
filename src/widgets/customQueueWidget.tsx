import { usePlugin, renderWidget, Queue, Rem, Card, RNPlugin, RemType, RichTextInterface, RepetitionStatus, QueueInteractionScore, EventCallbackFn
} from '@remnote/plugin-sdk';
import { useEffect, useState } from 'react';
//import { getLastInterval, getWrongInRow, formatMilliseconds } from ''
import MyRemNoteButton from '../components/MyRemNoteButton';

// -> AbstractionAndInheritance
const specialNames = ["Hide Bullets", "Status", "query:", "query:#", "contains:", "Document", "Tags", "Rem With An Alias", "Highlight", "Tag", "Color", "Alias", "Bullet Icon"];

// -> index
// Constants for time in milliseconds
const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

const DEFAULT_AGAIN = 30 * MS_PER_MINUTE;
const DEFAULT_HARD = 12 * MS_PER_HOUR;
const DEFAULT_GOOD = 2 * MS_PER_DAY;
const DEFAULT_EASY = 4 * MS_PER_DAY;

// -> AbstractionAndInheritance
async function isReferencingRem(plugin: RNPlugin, rem: Rem): Promise<boolean> {
    if(rem)
    return (await rem.remsBeingReferenced()).length != 0;

    return false;
}

// -> AbstractionAndInheritance
async function processRichText(plugin: RNPlugin, richText: RichTextInterface, showAlias = false): Promise<string> {
    const textPartsPromises = richText.map(async (item) => {
    if (typeof item === "string") {
    return item;
    }
    switch (item.i) {
    case 'm': return item.text;
    case 'q':
    const id = showAlias && item.aliasId ? item.aliasId : item._id;
    
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

// -> AbstractionAndInheritance
async function getRemText(plugin: RNPlugin, rem: Rem, extentedName = false): Promise<string> {
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
    if(extentedName && await rem.getType() == RemType.DESCRIPTOR) {
        const parentRem = await rem.getParentRem();

        if(parentRem)
            return await getRemText(plugin, parentRem) + ">" + item.text;
    }
    return item.text;
    case 's': return "";
    default: return "";
    }
    }) : [];

    const textParts = await Promise.all(textPartsPromises);
    return textParts.join("");
}

// -> AbstractionAndInheritance
async function getCleanChildren(plugin: RNPlugin, rem: Rem): Promise<Rem[]> {
    const childrenRems = await rem.getChildrenRem();
    const cleanChildren: Rem[] = [];
    for (const childRem of childrenRems) {
    const text = await getRemText(plugin, childRem);
    if (!specialNames.includes(text)) {
    cleanChildren.push(childRem);
    }
}
return cleanChildren;
}

// IMPORT DOESNT WORK! WHY? 
// -> index.tsx
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

// -> index.tsx
function getTimestamp(date: Date | number): number {
  return typeof date === 'number' ? date : date.getTime();
}

// -> index.tsx
export function getLastRecordedInterval(history: RepetitionStatus[] | undefined): number {
  

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

  if (relevantHistory.length === 0) return 0;

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

export function getLastInterval(history: RepetitionStatus[] | undefined): number {
  if (!history || history.length === 0) return 0;

  const lastRep = history[history.length - 1];
  let lastRecordedInterval = getLastRecordedInterval(history);

  let currentInterval: number;

  switch (lastRep.score) {
    case QueueInteractionScore.RESET:
      currentInterval = 0;
      break;
    case QueueInteractionScore.AGAIN:
      //currentInterval = 30 * MS_PER_MINUTE; // 30 minutes
      currentInterval = getLastIntervalBeforeAgain(history);
      break;

    case QueueInteractionScore.TOO_EARLY:
    case QueueInteractionScore.HARD:
    case QueueInteractionScore.GOOD:
    case QueueInteractionScore.EASY:
      if (lastRecordedInterval === 0) {
        const prevRep = history[history.length-2];

        // RECOVER FROM AGAIN: 2nd TRY AFTER
        if(prevRep && prevRep.score == QueueInteractionScore.AGAIN) {
          const wrongInRow = getWrongInRow(history);
          lastRecordedInterval = getLastIntervalBeforeAgain(history);
          const denominators: { [key in QueueInteractionScore]?: number } = {
            [QueueInteractionScore.HARD]: wrongInRow + 3,
            [QueueInteractionScore.GOOD]: wrongInRow + 2,
            [QueueInteractionScore.EASY]: wrongInRow + 1,
          };
          //console.log("New Interval would be " + formatMilliseconds(lastInterval / (denominators[currentRep.score] || 1)));

          currentInterval = Math.max(DEFAULT_HARD, lastRecordedInterval / (denominators[lastRep.score] || 1));

          //console.log("We recover from an AGAIN score: Interval Before AGAIN: " + formatMilliseconds(lastRecordedInterval) + " Current Interval: " + formatMilliseconds(currentInterval));
          return currentInterval;
        }
        // NEW CARD
        // No prior interval: use fixed values
        if (lastRep.score === QueueInteractionScore.HARD) {
          currentInterval = 12 * MS_PER_HOUR; // 12 hours
        } else if (lastRep.score === QueueInteractionScore.GOOD) {
          currentInterval = 2 * MS_PER_DAY; // 2 days
        } else {
          currentInterval = 4 * MS_PER_DAY; // 4 days
        }
      } else {
        // Combine second-to-last interval with score
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

  //console.log("Last Recorded Interval: " + formatMilliseconds(lastRecordedInterval) + " Current Interval: " + formatMilliseconds(currentInterval));

  return currentInterval;
}

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

// -> index.tsx
function formatMilliseconds(ms : number): string {
  if (ms === 0) return 'New Card'; // Special case for zero // "0 seconds"
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

function formatTimeStamp(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear().toString();
    return `${day}.${month}.${year}`;
}

async function getCardsOfReferences(plugin: RNPlugin, rem: Rem, processed = new Set()) {
    if (processed.has(rem._id)) {
        return [];
    }
    processed.add(rem._id);

    let cards: Card[] = [];

    const remCards = await rem.getCards();
    cards = cards.concat(remCards);

    const childrenRem = await getCleanChildren(plugin, rem);
    const childrenRef = await rem.remsReferencingThis();

    // Check for Questions where the Ref appears as an Answer. Then add that question
    for (const r of childrenRef) {
        if (await r.isCardItem()) {
            const question = await r.getParentRem();
            if (question) {
                const questionId = question._id;
                const isQuestionInCards = cards.some(card => card.remId === questionId);
                if (!isQuestionInCards) {
                    const questionCards = await question.getCards();
                    cards = cards.concat(questionCards);
                }
            }
        }
    }

    const children = [...childrenRem, ...childrenRef];

    for (const child of children) {
        const childCards = await getCardsOfReferences(plugin, child, processed);
        cards = cards.concat(childCards);
    }

    return cards;
}

function CustomQueueWidget() {
    const plugin = usePlugin();
    const [focusedRem, setFocusedRem] = useState<Rem | undefined>(undefined);
    const [loading, setLoading] = useState<boolean>(false);
    const [cardIds, setCardIds] = useState<string[]>([]);
    const [cards, setCards] = useState<Card[]>([]);
    const [currentCardId, setCurrentCardId] = useState<string | undefined>(undefined);
    const [currentCardLastInterval, setCurrentCardLastInterval] = useState<string>("");
    const [currentCardWrongInRow, setCurrentCardWrongInRow] = useState<number>(0);
    const [focusedRemText, setFocusedRemText] = useState<string>('');
    const [isTableExpanded, setIsTableExpanded] = useState<boolean>(false);

    useEffect(() => {
        const init = async () => {
            if (focusedRem) {
                setLoading(true);
                const fetchedCards = await getCardsOfReferences(plugin, focusedRem);
                const ids = fetchedCards.map((c) => c._id);
                setCardIds(ids);
                setCards(fetchedCards);
                setLoading(false);
            } else {
                setCardIds([]);
                setCards([]);
                setCurrentCardId(undefined);
            }
        };
        init();
    }, [focusedRem, plugin]);

    useEffect(() => {
        const updateRemText = async () => {
        if (focusedRem) {
        const text = await getRemText(plugin, focusedRem);
        setFocusedRemText(text);
        } else {
        setFocusedRemText('');
        }
        };
        updateRemText();
    }, [focusedRem]);

    const loadCurrentRemQueue = async () => {
        setLoading(true);
        const currentFocusedRem = await plugin.focus.getFocusedRem();
        if (currentFocusedRem) {
            setFocusedRem(currentFocusedRem);

            //
            handleQueueClick();

            setIsTableExpanded(false); // Collapse the table. Default
        } else {
            setFocusedRem(undefined);
            setLoading(false);
        }
    };

    // Update Card Info
    const handleQueueClick = async () => {
        const syncedCardId = await plugin.storage.getSynced<string>('currentQueueCardId');
        if (syncedCardId) {
            setCurrentCardId(syncedCardId);

            const currentCard = cards.find((card) => card._id === currentCardId);
            if(currentCard && currentCard.repetitionHistory) {
                setCurrentCardLastInterval(formatMilliseconds(getLastInterval(currentCard.repetitionHistory)));
                setCurrentCardWrongInRow(getWrongInRow(currentCard.repetitionHistory))
            }
        }
        //setIsTableExpanded(false); // Collapse the table
    };

    const toggleTableExpansion = () => {
        setIsTableExpanded(!isTableExpanded);

        //
        handleQueueClick();
    };

    //const currentCard = cards.find((card) => card._id === currentCardId);

    return (
        <div style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", padding: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ paddingRight: '20px' }}>Current Queue: {focusedRemText || 'No Rem selected'}</div>
        <MyRemNoteButton
            text="Load Queue from Rem"
            onClick={loadCurrentRemQueue}
            img="M9 7V2.221a2 2 0 0 0-.5.365L4.586 6.5a2 2 0 0 0-.365.5H9Zm2 0V2h7a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5h7.586l-.293.293a1 1 0 0 0 1.414 1.414l2-2a1 1 0 0 0 0-1.414l-2-2a1 1 0 0 0-1.414 1.414l.293.293H4V9h5a2 2 0 0 0 2-2Z"
        />
        </div>
        {loading ? (
        <div>Loading flashcards...</div>
        ) : (
        focusedRem && cardIds.length > 0 ? (
            <div style={{ paddingRight: '20px' }}>
                <div>
                    <button onClick={toggleTableExpansion} style={{ marginBottom: 10 }}>
                        {isTableExpanded ? '-' + " Card Information" : '+' + " Card Information"}
                    </button>
                    {isTableExpanded && (
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
                        <thead>
                            <tr>
                            <th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>Last Interval</th>
                            <th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>Wrong Answers In A Row</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                            <td style={{ border: '1px solid #ddd', padding: 8 }}>
                                {currentCardLastInterval}
                            </td>
                            <td style={{ border: '1px solid #ddd', padding: 8 }}>
                                {currentCardWrongInRow}
                            </td>
                            </tr>
                        </tbody>
                        </table>
                    )}
                </div>
            <div onClick={handleQueueClick} style={{ cursor: 'pointer' }}>
                <Queue key={focusedRem._id} cardIds={cardIds} width={"100%"} maxHeight={"100%"} />
            </div>
            </div>
        ) : (
            <div>No Rem loaded. Click the button to load the current Rem.</div>
        )
        )}
        </div>
        );
}

renderWidget(CustomQueueWidget);
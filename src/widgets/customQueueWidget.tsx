import { usePlugin, renderWidget, Queue, Rem, Card, RNPlugin, RemType, RichTextInterface, RepetitionStatus, QueueInteractionScore, EventCallbackFn, AppEvents
} from '@remnote/plugin-sdk';
import { useEffect, useState } from 'react';
//import { getLastInterval, getWrongInRow, formatMilliseconds } from ''
import MyRemNoteButton from '../components/MyRemNoteButton';
import { format } from 'path';

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
async function getRemText(plugin: RNPlugin, rem: Rem | undefined, extentedName = false): Promise<string> {
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

    if(rem.isSlot && await rem.isSlot())
        return await getRemText(plugin, await rem.getParentRem()) + " > " + textParts.join("");
    else
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
function getTimestamp(date: Date | number): number {
  return typeof date === 'number' ? date : date.getTime();
}

// -> index.tsx
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

// -> index.tsx
function isInRecovery(history: RepetitionStatus[]): boolean {
  for (let i = history.length - 1; i >= 0; i--) {
      const score = history[i].score;
      if (score !== QueueInteractionScore.TOO_EARLY) {
          return score === QueueInteractionScore.AGAIN;
      }
  }
  return false; // All scores are TOO_EARLY or history is empty
}

// -> index.tsx
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

// -> index.tsx
export function getLastInterval_(history: RepetitionStatus[] | undefined): number {
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

  //console.log("Last Recorded Working Interval: " + formatMilliseconds(lastRecordedInterval) + " Current Working Interval: " + formatMilliseconds(currentInterval));

  return currentInterval;
}

function getLastInterval(card: Card | undefined): number | undefined {
    if (!card || !card.nextRepetitionTime) return 0;

    const history = card.repetitionHistory;

    if (!history || history.length === 0) return 0;

    for (let i = history.length - 1; i >= 0; i--) {
        const score = history[i].score;

        if(score == QueueInteractionScore.TOO_EARLY || score == QueueInteractionScore.AGAIN)
            return undefined;

        if (score === QueueInteractionScore.HARD ||
            score === QueueInteractionScore.GOOD ||
            score === QueueInteractionScore.EASY) {
            return card.nextRepetitionTime - getTimestamp(history[i].date);
        }
    }

    return undefined;
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
    const date = new Date(timestamp); // No * 1000 needed
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0'); // +1 because getMonth() is 0-based
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

function getRepetitionTiming(card: Card) {
    if(card.nextRepetitionTime) {

        //console.log("Now: " + formatTimeStamp(Date.now()) + " nextRepetition: " + formatTimeStamp(card.nextRepetitionTime));

        return card.nextRepetitionTime - Date.now();
    }
    else
        return 0;
}

/*
function getLastIntervals_(history: RepetitionStatus[] | undefined): string {
    if (!history || history.length === 0) return "No intervals";
  
    const intervals: number[] = [];
    let tempHistory = [...history]; // Create a copy of the history
  
    for (let i = 0; i < 5; i++) {
      if (tempHistory.length === 0) break;
      const interval = getLastInterval(tempHistory);
      intervals.unshift(interval); // Add to beginning for oldest-to-newest order
      tempHistory = tempHistory.slice(0, -1); // Remove last repetition
    }
  
    // Format intervals into a string
    const formattedIntervals = intervals.map(interval => formatMilliseconds(interval)).join(" -> ");
    return formattedIntervals;
}

function getLastIntervals(card: Card): string {
    const history = card.repetitionHistory;

    if (!history || history.length === 0) return "No intervals";
  
    const intervals: number[] = [];
    let tempHistory = [...history]; // Create a copy of the history
  
    for (let i = 0; i < 5; i++) {
      if (tempHistory.length === 0) break;
      const interval = getLastInterval(tempHistory);
      intervals.unshift(interval); // Add to beginning for oldest-to-newest order
      tempHistory = tempHistory.slice(0, -1); // Remove last repetition
    }
  
    // Format intervals into a string
    const formattedIntervals = intervals.map(interval => formatMilliseconds(interval)).join(" -> ");
    return formattedIntervals;
}
    */

function getLastRatingStr(history: RepetitionStatus[] | undefined): string {
    // Handle undefined or empty array
    if (!history || history.length === 0) {
        return "";
    }

    // Iterate from the last element to the first
    for (let i = history.length - 1; i >= 0; i--) {
        const score = history[i].score;
        // Skip TOO_EARLY and VIEWED_AS_LEECH
        if (score !== QueueInteractionScore.TOO_EARLY && score !== QueueInteractionScore.VIEWED_AS_LEECH) {
            switch (score) {
                case QueueInteractionScore.AGAIN:
                    return "Forgot";
                case QueueInteractionScore.HARD:
                    return "Partially recalled";
                case QueueInteractionScore.GOOD:
                    return "Recalled with effort";
                case QueueInteractionScore.EASY:
                    return "Easily recalled";
                case QueueInteractionScore.RESET:
                    return "Reset";
                default:
                    // Handle unexpected scores (though unlikely with enum)
                    return "";
            }
        }
    }

    // Return empty string if all scores are TOO_EARLY or VIEWED_AS_LEECH
    return "";
}

async function loadCards(plugin: RNPlugin, rem: Rem | undefined, cardIds: string[]): Promise<Card[]> {
    if(!rem)
        return [];

    const allCards = await getCardsOfReferences(plugin, rem);
    const cardIdSet = new Set(cardIds);
    const filteredCards = allCards.filter(card => cardIdSet.has(card._id));
    return filteredCards;
}

function CustomQueueWidget() {
    const plugin = usePlugin();
    const [focusedRem, setFocusedRem] = useState<Rem | undefined>(undefined);
    const [loading, setLoading] = useState<boolean>(false);
    const [cardIds, setCardIds] = useState<string[]>([]);
    const [cards, setCards] = useState<Card[]>([]);
    const [currentCardId, setCurrentCardId] = useState<string | undefined>(undefined);
    const [currentCardText, setCurrentCardText] = useState<string>("");
    const [currentCardLastInterval, setCurrentCardLastInterval] = useState<string>("");
    const [currentCardRepetitionTiming, setcurrentCardRepetitionTiming] = useState<number>(0);
    const [currentCardLastRating, setcurrentCardLastRating] = useState<string>("");
    const [isTableExpanded, setIsTableExpanded] = useState<boolean>(false);
    const [focusedRemText, setFocusedRemText] = useState<string>("");
  
    // Load persisted state on mount
    useEffect(() => {
      const initFromStorage = async () => {
        const currentQueueRemId: string | undefined = await plugin.storage.getSynced("currentQueueRemId");
        const currentQueueCardIds: string[] = (await plugin.storage.getSynced("currentQueueCardIds")) || [];
        if (currentQueueRemId && currentQueueCardIds.length > 0) {
          const rem = await plugin.rem.findOne(currentQueueRemId);
          if (rem) {
            setFocusedRem(rem);
            setCardIds(currentQueueCardIds);
            const loadedCards = await loadCards(plugin, rem, currentQueueCardIds);
            setCards(loadedCards);
            updateCardInfo();
          }
        }
      };
      initFromStorage();
    }, [plugin]);
  
    // Event listener for card updates
    useEffect(() => {
      const handleQueueLoadCard = async (event: any) => {
        const cardId = event.cardId;
        if (cardId) {
          setCurrentCardId(cardId);
          await plugin.storage.setSynced("currentQueueCardId", cardId);
          const currentCard = await plugin.card.findOne(cardId);
          if (currentCard) {
            //setCurrentCardLastInterval(getLastIntervals(currentCard.repetitionHistory));
            const lastInterval = getLastInterval(currentCard) ?? getLastInterval_(currentCard.repetitionHistory);
            
            setCurrentCardLastInterval(formatMilliseconds(lastInterval)); // getLastIntervals(currentCard)
            if(lastInterval != 0)
                setcurrentCardRepetitionTiming(getRepetitionTiming(currentCard));
            else
                setcurrentCardRepetitionTiming(0);
            setcurrentCardLastRating(getLastRatingStr(currentCard.repetitionHistory));
          }
        }
      };
  
      plugin.event.addListener(AppEvents.QueueLoadCard, undefined, handleQueueLoadCard);
      return () => {
        plugin.event.removeListener(AppEvents.QueueLoadCard, undefined, handleQueueLoadCard);
      };
    }, [plugin]);

    // Update focusedRem text
    useEffect(() => {
        const updateRemText = async () => {
          if (focusedRem) {
            const text = await getRemText(plugin, focusedRem);
            setFocusedRemText(text);
          } else {
            setFocusedRemText("");
          }
        };
        updateRemText();
      }, [focusedRem]);
    
    const loadCurrentRemQueue = async () => {
        setLoading(true);
        const currentFocusedRem = await plugin.focus.getFocusedRem();

        if (currentFocusedRem) {
            const updateQueue = async () => {
            setLoading(true);
            const fetchedCards = await getCardsOfReferences(plugin, currentFocusedRem);
            const ids = fetchedCards.map((c) => c._id);
            setCardIds(ids);
            setCards(fetchedCards);
            await plugin.storage.setSynced("currentQueueRemId", currentFocusedRem._id);
            await plugin.storage.setSynced("currentQueueCardIds", ids);

            //await plugin.storage.setSynced("currentQueueCards", fetchedCards);

            setLoading(false);
            setFocusedRem(currentFocusedRem);
            setIsTableExpanded(false);
            };
            updateQueue();
        }
    };
  
    const updateCardInfo = async () => {
      const syncedCardId = await plugin.storage.getSynced<string>("currentQueueCardId");
      if (syncedCardId) {
        setCurrentCardId(syncedCardId);
        const currentCard = await plugin.card.findOne(syncedCardId);
        if (currentCard) { // && currentCard.repetitionHistory
            const lastInterval = getLastInterval(currentCard) ?? getLastInterval_(currentCard.repetitionHistory);
            
            setCurrentCardLastInterval(formatMilliseconds(lastInterval)); // getLastIntervals(currentCard)
            if(lastInterval != 0)
                setcurrentCardRepetitionTiming(getRepetitionTiming(currentCard));
            else
                setcurrentCardRepetitionTiming(0);
          setcurrentCardLastRating(getLastRatingStr(currentCard.repetitionHistory));
          setCurrentCardText(await getRemText(plugin, await currentCard.getRem())); // 
        }
      }
    };
  
    // Rest of your component (loadCurrentRemQueue, JSX, etc.) remains unchanged
    const openQueueRem = async () => {
      
        if (focusedRem) {
          await plugin.window.openRem(focusedRem);
        }
      };
  
      const openFlashCardRem = async () => {
          const currentCard = cards.find((card) => card._id === currentCardId);
          const rem = await currentCard?.getRem();
          if (rem) {
            await plugin.window.openRem(rem);
          }
        };
    
      const toggleTableExpansion = () => {
        setIsTableExpanded(!isTableExpanded);
        updateCardInfo();
      };
    
      return (
        <div style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", padding: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ paddingRight: "20px" }}>Current Queue: {focusedRemText || "No Rem selected"} <MyRemNoteButton text="" onClick={openQueueRem} img="M9 7V2.221a2 2 0 0 0-.5.365L4.586 6.5a2 2 0 0 0-.365.5H9Zm2 0V2h7a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5h7.586l-.293.293a1 1 0 0 0 1.414 1.414l2-2a1 1 0 0 0 0-1.414l-2-2a1 1 0 0 0-1.414 1.414l.293.293H4V9h5a2 2 0 0 0 2-2Z" /></div> 
            <MyRemNoteButton text="Load New Queue from Rem" onClick={loadCurrentRemQueue} img="M9 8h10M9 12h10M9 16h10M4.99 8H5m-.02 4h.01m0 4H5" />
          </div>
          {loading ? (
            <div>Loading flashcards...</div>
          ) : cardIds.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", flex: "1", overflow: "auto" }}>
              <div style={{ marginTop: "10px" }}>
                <button onClick={toggleTableExpansion} style={{ marginBottom: 10 }}>
                  {isTableExpanded ? "- Card Information: " : "+ Card Information: "}{currentCardText}
                </button>
                <MyRemNoteButton text="" onClick={openFlashCardRem} img="M9 7V2.221a2 2 0 0 0-.5.365L4.586 6.5a2 2 0 0 0-.365.5H9Zm2 0V2h7a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5h7.586l-.293.293a1 1 0 0 0 1.414 1.414l2-2a1 1 0 0 0 0-1.414l-2-2a1 1 0 0 0-1.414 1.414l.293.293H4V9h5a2 2 0 0 0 2-2Z" />
                {isTableExpanded && (
                  <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
                    <thead>
                      <tr>
                        <th style={{ border: "1px solid #ddd", padding: 8, textAlign: "left" }}>Date</th>
                        <th style={{ border: "1px solid #ddd", padding: 8, textAlign: "left" }}>Last Interval</th>
                        <th style={{ border: "1px solid #ddd", padding: 8, textAlign: "left" }}>Last Rating</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ border: "1px solid #ddd", padding: 8 }}>
                          {currentCardRepetitionTiming == 0
                            ? ""
                            : currentCardRepetitionTiming < 0
                            ? "Late (" + formatMilliseconds(currentCardRepetitionTiming) + ")"
                            : "Early (" + formatMilliseconds(currentCardRepetitionTiming) + ")"}
                        </td>
                        <td style={{ border: "1px solid #ddd", padding: 8 }}>{currentCardLastInterval}</td>
                        <td style={{ border: "1px solid #ddd", padding: 8 }}>{currentCardLastRating}</td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
              <div /*onClick={updateCardInfo}*/ style={{ cursor: "pointer" }}>
                <Queue cardIds={cardIds} width={"100%"} maxWidth={"100%"} />
              </div>
            </div>
          ) : (
            <div>No cards to display. CardIds is empty: {JSON.stringify(cardIds)}</div>
          )}
        </div>
      );
  }

renderWidget(CustomQueueWidget);
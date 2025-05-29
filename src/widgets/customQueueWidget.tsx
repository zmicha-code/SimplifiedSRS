import { usePlugin, renderWidget, Queue, Rem, Card, RNPlugin, RemType, RichTextInterface, RepetitionStatus, QueueInteractionScore, EventCallbackFn, AppEvents, BuiltInPowerupCodes, useTracker
} from '@remnote/plugin-sdk';
import { useEffect, useState } from 'react';
//import { getLastInterval, getWrongInRow, formatMilliseconds } from ''
import MyRemNoteButton from '../components/MyRemNoteButton';
import { format } from 'path';

// -> AbstractionAndInheritance
export const specialNames = ["Collapse Tag Configure Options", "Hide Bullets", "Status", "query:", "query:#", "contains:", "Document", "Tags", "Rem With An Alias", "Highlight", "Tag", "Color", "Alias", "Aliases", "Bullet Icon"]; // , "Definition", "Eigenschaften"

export const specialNameParts = ["query:", "contains:"];

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

// -> AbstractionAndInheritance
export async function getCleanChildrenAll(plugin: RNPlugin, rem: Rem): Promise<Rem[]> {
  // Fetch direct children and referencing Rems
  const childrenRems = await rem.getChildrenRem();
  const referencingRems = await rem.remsReferencingThis();
  const allRems = [...childrenRems, ...referencingRems];

  // Remove duplicates based on Rem _id
  const uniqueRemsMap = new Map<string, Rem>();
  for (const r of allRems) {
    if (!uniqueRemsMap.has(r._id)) {
      uniqueRemsMap.set(r._id, r);
    }
  }
  const uniqueRems = Array.from(uniqueRemsMap.values());

  // Fetch texts concurrently for efficiency
  const texts = await Promise.all(uniqueRems.map(r => getRemText(plugin, r)));

  // Apply the same filtering as getCleanChildren
  const cleanRems: Rem[] = [];
  for (let i = 0; i < uniqueRems.length; i++) {
    const text = texts[i];
    if (
      !specialNames.includes(text) &&
      !specialNameParts.some(part => text.startsWith(part))
    ) {
      cleanRems.push(uniqueRems[i]);
    }
  }
  return cleanRems;
}

// -> index.tsx
function formatMilliseconds(ms : number): string {
  let isNegative = false;

  if (ms === 0) return 'New Card'; // Special case for zero // "0 seconds"
  if (ms < 0) {
    isNegative = true;
    ms = Math.abs(ms);    // Handle negatives with absolute value
  }

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
  return (isNegative ? "-" : "") + value + " " + unit + plural;
}

async function getCardsOfRem(plugin: RNPlugin, rem: Rem, processed = new Set(), addedCardIds = new Set()) {
    if (processed.has(rem._id)) {
        return [];
    }
    processed.add(rem._id);

    let cards: Card[] = [];

    const remCards = await rem.getCards();

    //cards = cards.concat(remCards);
    for(const c of remCards) {
      if (!addedCardIds.has(c._id)) {
        addedCardIds.add(c._id);
        cards.push(c);
      }
    }
    
    const childrenRem = await getCleanChildrenAll(plugin, rem);

    // A Reference to another Flashcard appears in the Answer of a Flashcard
    for(const c of childrenRem) {
      const refs = await c.remsBeingReferenced();

      if (refs.length > 0 && (await c.isCardItem() || await c.hasPowerup(BuiltInPowerupCodes.ExtraCardDetail))) { // 
        const ref= refs[0];

        // If the Ref is a Flashcard, add it.
        if((await ref.getCards()).length > 0) {
          //const isQuestionInCards = cards.some(card => card.remId === ref._id);
          //if (!isQuestionInCards) {
          //    const questionCards = await ref.getCards();
          //    cards = cards.concat(questionCards);
          //}
          const questionCards = await ref.getCards();

          for(const c of questionCards) {
            if (!addedCardIds.has(c._id)) {
              addedCardIds.add(c._id);
              cards.push(c);
            }
          }
        }

        // TODO: What to do if the Ref is a Concept?
      }
    }

    const childrenRef = await rem.remsReferencingThis();

    // Check for Questions where the current Question appears as an Answer.
    for (const r of childrenRef) {
        if (await r.isCardItem() || await r.hasPowerup(BuiltInPowerupCodes.ExtraCardDetail)) { // 
            const question = await r.getParentRem();
            if (question) {
                const questionId = question._id;
                //const isQuestionInCards = cards.some(card => card.remId === questionId);
                //if (!isQuestionInCards) {
                //    const questionCards = await question.getCards();
                //    cards = cards.concat(questionCards);
                //}
                const questionCards = await question.getCards();

                for(const c of questionCards) {
                  if (!addedCardIds.has(c._id)) {
                    addedCardIds.add(c._id);
                    cards.push(c);
                  }
                }
            }
        }
    }

    const children = [...childrenRem, ...childrenRef];

    for (const child of children) {
      const childCards = await getCardsOfRem(plugin, child, processed, addedCardIds);
      cards = cards.concat(childCards);
    }

    return cards;
}

async function getCardsOfRemDue(plugin: RNPlugin, rem: Rem): Promise<Card[]> {
  const allCards = await getCardsOfRem(plugin, rem);

  // There are cards where this doesnt work.
  //const dueCards = allCards.filter(card => {
  //  return card.nextRepetitionTime === undefined || 
  //         (typeof card.nextRepetitionTime === 'number' && card.nextRepetitionTime <= Date.now());
  //});

  const dueCards = allCards.filter(card => {
    const lastInterval = getLastInterval(card?.repetitionHistory);
    return lastInterval ? lastInterval.intervalSetOn + lastInterval.workingInterval - Date.now() < 0 : true;
  });

  //console.log("dueCards: " + dueCards.length);
  return dueCards;
}

async function getCardsOfRemDisabled(plugin: RNPlugin, rem: Rem, processed = new Set(), addedCardIds = new Set()): Promise<{ id: string, text: string, nextDate: number }[]> {
  if (processed.has(rem._id)) {
        return [];
    }
  processed.add(rem._id);

  let cards: { id: string, text: string, nextDate: number }[] = [];

  //
  const childrenRem = await getCleanChildrenAll(plugin, rem);

  // Check Children for Disabled Flashcards
  for(const c of childrenRem) {
    //console.log(name + ": Direction" + await c.getEnablePractice())
    if(!(await c.getEnablePractice())) {
      //console.log("Adding " + name + "(" + c._id + ")");
      if (!addedCardIds.has(c._id)) {
        addedCardIds.add(c._id);

        const name = await getRemText(plugin, c);
        cards.push({ id: c._id, text: name, nextDate: 0 });
      }
    } else {
      //console.log(name + " has no PowerUp.DisableCards");
    }
  }

  // A Reference to another Question appears in the Answer of a Flashcard
  for(const c of childrenRem) {
    const refs = await c.remsBeingReferenced();

    if (refs.length > 0 && (await c.isCardItem() || await c.hasPowerup(BuiltInPowerupCodes.ExtraCardDetail))) { // 
      const ref = refs[0];

      // If the Ref is a Disabled Flashcard, add it.
      if(!(await ref.getEnablePractice())) {

        if (!addedCardIds.has(ref._id)) {
          addedCardIds.add(ref._id);
          const name = await getRemText(plugin, ref);
          cards.push({id: ref._id, text: name, nextDate: 0});
        }
      }

      // TODO: What to do if the Ref is a Concept?
    }
  }

  //
  const childrenRef = await rem.remsReferencingThis();

  // Check for Questions where the current Question appears as an Answer.
  for (const r of childrenRef) {
    if (await r.isCardItem() || await r.hasPowerup(BuiltInPowerupCodes.ExtraCardDetail)) { // 
        const question = await r.getParentRem();
        if (question && !(await question.getEnablePractice())) {
          if (!addedCardIds.has(question._id)) {
            addedCardIds.add(question._id);
            cards.push({id: question._id, text: await getRemText(plugin, question), nextDate: 0});
          } 
        }
    }
  }

  // Recursion
  const children = [...childrenRem, ...childrenRef];
  for (const c of children) {
    const childCards = await getCardsOfRemDisabled(plugin, c, processed, addedCardIds);
    cards = cards.concat(childCards);
  }

  return cards;
}

async function loadCards(plugin: RNPlugin, rem: Rem | undefined, cardIds: string[]): Promise<Card[]> {
    if(!rem)
        return [];

    const allCards = await getCardsOfRem(plugin, rem);
    const cardIdSet = new Set(cardIds);
    const filteredCards = allCards.filter(card => cardIdSet.has(card._id));
    return filteredCards;
}

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

async function questionsFromCards_(plugin: RNPlugin, cards: Card[]): Promise<string[]> {
  let questions: string[] = [];

  for(const c of cards) {
    questions.push(await getRemText(plugin, await c.getRem()));
  }

  return questions;
}

// Updated to return an array of { id, text } objects
async function questionsFromCards(plugin: RNPlugin, cards: Card[]): Promise<{ id: string, text: string, nextDate: number }[]> {
    const questions: { id: string, text: string, nextDate: number }[] = [];
    for (const c of cards) {
        const rem = await c.getRem();
        const text = rem ? await getRemText(plugin, rem) : '';

        const lastInterval = getLastInterval(c.repetitionHistory);
        questions.push({ id: rem ? rem._id : c._id, text, nextDate: lastInterval ? lastInterval.intervalSetOn + lastInterval.workingInterval : 0});
    }
    return questions;
}

/*
function CustomQueueWidget_() {
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

    const [isListExpanded, setIsListExpanded] = useState<boolean>(false);
    const [cardsStr, setCardsStr] = useState<string[]>([]);
  
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
            //
            setCardsStr(await questionsFromCards(plugin, loadedCards));
            
            // Card Info Panel
            updateCardInfo();
          }
        }
      };
      initFromStorage();
    }, [plugin]);

    // Event listener for card updates
    useEffect(() => {
      const handleQueueLoadCard = async (event: any) => {
    
        updateCardInfo(event.cardId);
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
            const fetchedCards = await getCardsOfRem(plugin, currentFocusedRem);
            const ids = fetchedCards.map((c) => c._id);
            setCardIds(ids);
            setCards(fetchedCards);
            //
            setCardsStr(await questionsFromCards(plugin, fetchedCards));
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

    const loadCurrentRemQueueDue = async () => {
      setLoading(true);
      const currentFocusedRem = await plugin.focus.getFocusedRem();

      if (currentFocusedRem) {
          const updateQueue = async () => {
          setLoading(true);
          const fetchedCards = await getCardsOfRemDue(plugin, currentFocusedRem);
          const ids = fetchedCards.map((c) => c._id);
          setCardIds(ids);
          setCards(fetchedCards);
          //
          setCardsStr(await questionsFromCards(plugin, fetchedCards));
          await plugin.storage.setSynced("currentQueueRemId", currentFocusedRem._id);
          await plugin.storage.setSynced("currentQueueCardIds", ids);

          setLoading(false);
          setFocusedRem(currentFocusedRem);
          setIsTableExpanded(false);
          };
          updateQueue();
      }
  };
  
    const updateCardInfo = async (cardId = undefined) => {
      const id = cardId ?? await plugin.storage.getSynced<string>("currentQueueCardId");
      if (id) {
        setCurrentCardId(id);
        const currentCard = await plugin.card.findOne(id);
        const rem = await currentCard?.getRem();

        //console.log("Current Card: " + await getRemText(plugin, rem));

        //const cardInterval = await plugin.storage.getSynced<number>("currentQueueCardInterval") ?? 0;
        const lastInterval = getLastInterval(currentCard?.repetitionHistory)

        setCurrentCardLastInterval(lastInterval ? formatMilliseconds(lastInterval.workingInterval) : "");
        setcurrentCardRepetitionTiming(lastInterval ? lastInterval.intervalSetOn + lastInterval.workingInterval - Date.now() : 0);
        setcurrentCardLastRating(getLastRatingStr(currentCard?.repetitionHistory));
      }
    };

    async function onMouseClick() {
      updateCardInfo();
    }
  
    // Rest of your component (loadCurrentRemQueue, JSX, etc.) remains unchanged
    const openQueueRem = async () => {
      
        if (focusedRem) {
          await plugin.window.openRem(focusedRem);
        }
    };
  
    const openCurrentFlashcard = async () => {
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

    const toogleCardList = () => {
      setIsListExpanded(!isListExpanded);
      //updateCardInfo();
    };
  
    return (
      <div style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", padding: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ paddingRight: "20px" }}>Current Queue: {focusedRemText || "No Rem selected"} <MyRemNoteButton text="" onClick={openQueueRem} img="M9 7V2.221a2 2 0 0 0-.5.365L4.586 6.5a2 2 0 0 0-.365.5H9Zm2 0V2h7a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5h7.586l-.293.293a1 1 0 0 0 1.414 1.414l2-2a1 1 0 0 0 0-1.414l-2-2a1 1 0 0 0-1.414 1.414l.293.293H4V9h5a2 2 0 0 0 2-2Z" /></div> 
          <div style={{ paddingRight: "20px" }}>Practice Flashcards from Rem: 
            <MyRemNoteButton text="All" onClick={loadCurrentRemQueue} img="M9 8h10M9 12h10M9 16h10M4.99 8H5m-.02 4h.01m0 4H5" />
            <MyRemNoteButton text="Due" onClick={loadCurrentRemQueueDue} img="M9 8h10M9 12h10M9 16h10M4.99 8H5m-.02 4h.01m0 4H5" />
          </div>
        </div>
        {loading ? (
          <div>Loading flashcards...</div>
        ) : cardIds.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", flex: "1", overflow: "auto" }}>
            <div style={{ marginTop: "10px" }}>
              <button onClick={toogleCardList} style={{ marginBottom: 10 }}>
                {isListExpanded ? "- Card List:" : "+ Card List: "}
              </button>
              {isListExpanded && (
                <div>
                  {cardsStr.map((c) => (
                    <div><MyRemNoteButton text={c} onClick={async () => {}}/></div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ marginTop: "10px" }}>
              <button onClick={toggleTableExpansion} style={{ marginBottom: 10 }}>
                {isTableExpanded ? "- Card Information: " : "+ Card Information: "}{currentCardText}
              </button>
              <MyRemNoteButton text="" onClick={openCurrentFlashcard} img="M9 7V2.221a2 2 0 0 0-.5.365L4.586 6.5a2 2 0 0 0-.365.5H9Zm2 0V2h7a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5h7.586l-.293.293a1 1 0 0 0 1.414 1.414l2-2a1 1 0 0 0 0-1.414l-2-2a1 1 0 0 0-1.414 1.414l.293.293H4V9h5a2 2 0 0 0 2-2Z" />
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
            <div onClick={onMouseClick} style={{ cursor: "pointer" }}>
              <Queue cardIds={cardIds} width={"100%"} maxWidth={"100%"} />
            </div>
          </div>
        ) : (
          <div>No cards to display. CardIds is empty: {JSON.stringify(cardIds)}</div>
        )}
      </div>
    );
}
*/

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
    const [queueRemText, setQueueRemText] = useState<string>("");
    const [selectedRemText, setSelectedRemText] = useState<string>("");
    const [isListExpanded, setIsListExpanded] = useState<boolean>(false);
    // Updated state type to array of objects
    const [cardsData, setCardsData] = useState<{ id: string, text: string , nextDate: number}[]>([]);
    const [sortAscending, setSortAscending] = useState<boolean>(true);

    const currentRem = useTracker(async (reactPlugin) => {
            return await reactPlugin.focus.getFocusedRem();
        }
    );

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
                    setCardsData(await questionsFromCards(plugin, loadedCards));
                    updateCardInfo();
                }
            }
        };
        initFromStorage();
    }, [plugin]);

    useEffect(() => {
        const handleQueueLoadCard = async (event: any) => {
            updateCardInfo(event.cardId);
        };
        plugin.event.addListener(AppEvents.QueueLoadCard, undefined, handleQueueLoadCard);
        return () => {
            plugin.event.removeListener(AppEvents.QueueLoadCard, undefined, handleQueueLoadCard);
        };
    }, [plugin]);

    useEffect(() => {
        const updateRemText = async () => {
          //setFocusedRem(currentRem);

          if (focusedRem) {
              const text = await getRemText(plugin, focusedRem);
              setQueueRemText(text);
          } else {
            setQueueRemText("");
          }
        };
        updateRemText();
    }, [focusedRem]); // focusedRem

    useEffect(() => {
      const updateSelectedRemText = async () => {
        const txt = await getRemText(plugin, currentRem);
        setSelectedRemText(txt == "" ? "No Rem Selected" : txt);
      };
      updateSelectedRemText();
    }, [currentRem]); // focusedRem

    const loadCurrentRemQueue = async () => {
      //console.log(await getRemText(plugin, focusedRem));

      setCardIds([]);
      setCards([]);
      setCardsData([]);
      setFocusedRem(undefined);
      setIsTableExpanded(false);
      //setLoading(true);
      const currentFocusedRem = currentRem; // focusedRem; //await plugin.focus.getFocusedRem();
      if (currentFocusedRem) {
          const updateQueue = async () => {
              setLoading(true);
              const text = await getRemText(plugin, currentFocusedRem);
              setQueueRemText(text);
              const fetchedCards = await getCardsOfRem(plugin, currentFocusedRem);
              const ids = fetchedCards.map((c) => c._id);
              setCardIds(ids);
              setCards(fetchedCards);
              setCardsData(await questionsFromCards(plugin, fetchedCards));
              await plugin.storage.setSynced("currentQueueRemId", currentFocusedRem._id);
              await plugin.storage.setSynced("currentQueueCardIds", ids);
              setLoading(false);
              setFocusedRem(currentFocusedRem);
              setIsTableExpanded(false);
          };
          updateQueue();
      }
    };

    const loadCurrentRemQueueDue = async () => {
        setCardIds([]);
        setCards([]);
        setCardsData([]);
        setFocusedRem(undefined);
        setIsTableExpanded(false);
        //setLoading(true);
        const currentFocusedRem = currentRem; //focusedRem; //await plugin.focus.getFocusedRem();
        if (currentFocusedRem) {
            const updateQueue = async () => {
                setLoading(true);
                const text = await getRemText(plugin, currentFocusedRem);
                setQueueRemText(text);
                const fetchedCards = await getCardsOfRemDue(plugin, currentFocusedRem);
                const ids = fetchedCards.map((c) => c._id);
                setCardIds(ids);
                setCards(fetchedCards);
                setCardsData(await questionsFromCards(plugin, fetchedCards));
                await plugin.storage.setSynced("currentQueueRemId", currentFocusedRem._id);
                await plugin.storage.setSynced("currentQueueCardIds", ids);
                setLoading(false);
                setFocusedRem(currentFocusedRem);
                setIsTableExpanded(false);
            };
            updateQueue();
        }
    };

    const loadCurrentRemQueueDisabled = async () => {
      setCardIds([]);
      setCards([]);
      setCardsData([]);
      setFocusedRem(undefined);
      setIsTableExpanded(false);

      const currentFocusedRem = currentRem;

      if(currentFocusedRem) {
        const updateCardsList = async () => {
          setLoading(true);
          const text = await getRemText(plugin, currentFocusedRem);
          setQueueRemText(text);
          setCardsData(await getCardsOfRemDisabled(plugin, currentFocusedRem));
          setLoading(false);
          setFocusedRem(currentFocusedRem);
          setIsTableExpanded(false);
        };

        updateCardsList();
      }
    };

    const updateCardInfo = async (cardId = undefined) => {
        const id = cardId ?? await plugin.storage.getSynced<string>("currentQueueCardId");
        if (id) {
            setCurrentCardId(id);
            const currentCard = await plugin.card.findOne(id);
            const rem = await currentCard?.getRem();
            const lastInterval = getLastInterval(currentCard?.repetitionHistory);
            setCurrentCardLastInterval(lastInterval ? formatMilliseconds(lastInterval.workingInterval) : "");
            setcurrentCardRepetitionTiming(lastInterval ? lastInterval.intervalSetOn + lastInterval.workingInterval - Date.now() : 0);
            setcurrentCardLastRating(getLastRatingStr(currentCard?.repetitionHistory));
        }
    };

    async function onMouseClick() {
        updateCardInfo();
    }

    const openQueueRem = async () => {
        if (focusedRem) {
            await plugin.window.openRem(focusedRem);
        }
    };

    const openCurrentFlashcard = async () => {
        const currentCard = cards.find((card) => card._id === currentCardId);
        const rem = await currentCard?.getRem();
        if (rem) {
            await plugin.window.openRem(rem);
        }
    };

    const openRem = async (plugin: RNPlugin, id: string) => {
      const rem = await plugin.rem.findOne(id);

      if(rem)
        await plugin.window.openRem(rem);
    };

    const toggleTableExpansion = () => {
        setIsTableExpanded(!isTableExpanded);
        updateCardInfo();
    };

    const toogleCardList = () => {
        setIsListExpanded(!isListExpanded);
    };

    return (
  <div
    style={{
      height: "100%",
      width: "100%",
      display: "flex",
      flexDirection: "column",
      padding: 10,
      overflowY: "auto", // Add this to make the outer div scrollable
    }}
  >
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 8,
      }}
    >
      <div style={{
        width: "100%",
            maxHeight: "600px",
            overflowY: "scroll",
            padding: "10px",
            border: "1px solid #ddd",
            marginRight: "20px",
          }}>
        <div> Practice Flashcards from {selectedRemText}</div>
        <MyRemNoteButton
          text="All"
          onClick={loadCurrentRemQueue}
          img="M9 8h10M9 12h10M9 16h10M4.99 8H5m-.02 4h.01m0 4H5"
        />
        <MyRemNoteButton
          text="Due"
          onClick={loadCurrentRemQueueDue}
          img="M9 8h10M9 12h10M9 16h10M4.99 8H5m-.02 4h.01m0 4H5"
        />
        <MyRemNoteButton
          text="Disabled"
          onClick={loadCurrentRemQueueDisabled}
          img="M9 8h10M9 12h10M9 16h10M4.99 8H5m-.02 4h.01m0 4H5"
        />
      </div>
    </div>
    {loading ? (
      <div>Loading flashcards...</div>
    ) : cardsData.length > 0 ? (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          // Removed flex: "1" and overflowY: "scroll" so it takes natural height
        }}
      >
        <div style={{ marginTop: "10px", marginRight: "20px" }}>
          <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 8,
      }}>
            <MyRemNoteButton
              text={queueRemText ? "Current Queue: " + queueRemText : "No Rem selected"}
              onClick={openQueueRem}
              img="M9 7V2.221a2 2 0 0 0-.5.365L4.586 6.5a2 2 0 0 0-.365.5H9Zm2 0V2h7a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5h7.586l-.293.293a1 1 0 0 0 1.414 1.414l2-2a1 1 0 0 0 0-1.414l-2-2a1 1 0 0 0-1.414 1.414l.293.293H4V9h5a2 2 0 0 0 2-2Z"
            />
            <button onClick={toogleCardList} style={{ marginBottom: 10 }}>
              {(isListExpanded ? "Collapse Cards" : "Expand Cards") +
                "(" +
                cardsData.length +
                "): "}
            </button>
          </div>
          {isListExpanded && (
            <div style={{ maxHeight: "500px", overflowY: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                marginBottom: 10,
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      border: "1px solid #ddd",
                      padding: 8,
                      textAlign: "left",
                    }}
                  >
                    Question
                  </th>
                  <th
                    style={{
                      border: "1px solid #ddd",
                      padding: 8,
                      textAlign: "left",
                    }}
                  >
                    <MyRemNoteButton text={"Next Date"} onClick={() => {setSortAscending(!sortAscending); setIsListExpanded(false);}}/>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...cardsData].sort((a, b) => (sortAscending ? a.nextDate - b.nextDate : b.nextDate - a.nextDate)).map((c) => (
                  <tr key={c.id}>
                    <td style={{ border: "1px solid #ddd", padding: 8 }}>
                      <MyRemNoteButton
                        text={c.text}
                        onClick={async () => {
                          openRem(plugin, c.id);
                        }}
                      />
                    </td>
                    <td style={{ border: "1px solid #ddd", padding: 8 }}>
                      {formatMilliseconds(c.nextDate - Date.now())}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
        <div style={{ marginTop: "10px", marginRight: "20px" }}>
          <button onClick={toggleTableExpansion} style={{ marginBottom: 10 }}>
            {isTableExpanded ? "- Card Information: " : "+ Card Information: "}
            {currentCardText}
          </button>
          <MyRemNoteButton
            text=""
            onClick={openCurrentFlashcard}
            img="M9 7V2.221a2 2 0 0 0-.5.365L4.586 6.5a2 2 0 0 0-.365.5H9Zm2 0V2h7a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5h7.586l-.293.293a1 1 0 0 0 1.414 1.414l2-2a1 1 0 0 0 0-1.414l-2-2a1 1 0 0 0-1.414 1.414l.293.293H4V9h5a2 2 0 0 0 2-2Z"
          />
          {isTableExpanded && (
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                marginBottom: 10,
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      border: "1px solid #ddd",
                      padding: 8,
                      textAlign: "left",
                    }}
                  >
                    Date
                  </th>
                  <th
                    style={{
                      border: "1px solid #ddd",
                      padding: 8,
                      textAlign: "left",
                    }}
                  >
                    Last Interval
                  </th>
                  <th
                    style={{
                      border: "1px solid #ddd",
                      padding: 8,
                      textAlign: "left",
                    }}
                  >
                    Last Rating
                  </th>
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
                  <td style={{ border: "1px solid #ddd", padding: 8 }}>
                    {currentCardLastInterval}
                  </td>
                  <td style={{ border: "1px solid #ddd", padding: 8 }}>
                    {currentCardLastRating}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
        <div
          onClick={onMouseClick}
          style={{
            height: "600px",
            overflowY: "scroll",
            padding: "10px",
            border: "1px solid #ddd",
            marginRight: "20px",
          }}
        >
          <Queue
            cardIds={cardIds}
            width={"100%"}
            maxWidth={"100%"}
            height={"100%"}
            maxHeight={"100%"}
          />
        </div>
      </div>
    ) : (
      <div>No cards to display. CardIds is empty: {JSON.stringify(cardIds)}</div>
    )}
  </div>
);
}

renderWidget(CustomQueueWidget);
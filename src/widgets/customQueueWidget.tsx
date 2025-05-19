import { usePlugin, renderWidget, Queue, Rem, Card, RNPlugin, RemType, RichTextInterface, RepetitionStatus, QueueInteractionScore, EventCallbackFn, AppEvents, BuiltInPowerupCodes
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

async function getCardsOfRem(plugin: RNPlugin, rem: Rem, processed = new Set()) {
    if (processed.has(rem._id)) {
        return [];
    }
    processed.add(rem._id);

    let cards: Card[] = [];

    const remCards = await rem.getCards();

    cards = cards.concat(remCards);
    
    // A Reference appears in the Answer of a Flashcard
    const childrenRem = await getCleanChildrenAll(plugin, rem);
    for(const c of childrenRem) {
      const refs = await c.remsBeingReferenced();

      if (refs.length > 0 && (await c.isCardItem() || await c.hasPowerup(BuiltInPowerupCodes.ExtraCardDetail))) { // 
        const ref= refs[0];

        // If the Ref is a Flashcard, add it.
        if((await ref.getCards()).length > 0) {
          const isQuestionInCards = cards.some(card => card.remId === ref._id);
            if (!isQuestionInCards) {
                const questionCards = await ref.getCards();
                cards = cards.concat(questionCards);
            }
        }

        // TODO: What to do if the Ref is a Concept?
      }
    }

    // Check for Questions where the Ref appears as an Answer. Then add that question
    const childrenRef = await rem.remsReferencingThis();
    for (const r of childrenRef) {
        if (await r.isCardItem() || await r.hasPowerup(BuiltInPowerupCodes.ExtraCardDetail)) { // 
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
      const childCards = await getCardsOfRem(plugin, child, processed);
      cards = cards.concat(childCards);
    }

    return cards;
}

async function getCardsOfRemDue(plugin: RNPlugin, rem: Rem): Promise<Card[]> {
  const allCards = await getCardsOfRem(plugin, rem);

  //console.log("allCards: " + allCards.length);

  const dueCards = allCards.filter(card => {
    return card.nextRepetitionTime === undefined || 
           (typeof card.nextRepetitionTime === 'number' && card.nextRepetitionTime <= Date.now());
  });

  //console.log("dueCards: " + dueCards.length);
  return dueCards;
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

renderWidget(CustomQueueWidget);
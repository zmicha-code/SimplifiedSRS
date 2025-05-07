import { usePlugin, renderWidget, Queue, Rem, Card, RNPlugin, RemType, RichTextInterface, RepetitionStatus, QueueInteractionScore
} from '@remnote/plugin-sdk';
import { useEffect, useState } from 'react';
//import { getLastInterval, getWrongInRow, formatMilliseconds } from ''
import MyRemNoteButton from '../components/MyRemNoteButton';

// -> AbstractionAndInheritance
const specialNames = ["Hide Bullets", "Status", "query:", "query:#", "contains:", "Document", "Tags", "Rem With An Alias", "Highlight", "Tag", "Color", "Alias", "Bullet Icon"];

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

    const children = [...await getCleanChildren(plugin, rem), ...await rem.remsReferencingThis()];

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
        } else {
            setFocusedRem(undefined);
            setLoading(false);
        }
    };

    const handleQueueClick = async () => {
        const syncedCardId = await plugin.storage.getSynced<string>('currentQueueCardId');
        if (syncedCardId) {
            setCurrentCardId(syncedCardId);
        }
        setIsTableExpanded(false); // Collapse the table
    };

    const toggleTableExpansion = () => {
        setIsTableExpanded(!isTableExpanded);
    };

    const currentCard = cards.find((card) => card._id === currentCardId);

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
            {currentCard && (
                <div>
                    <button onClick={toggleTableExpansion} style={{ marginBottom: 10 }}>
                        {isTableExpanded ? '-' : '+'}
                    </button>
                    {isTableExpanded && (
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
                        <thead>
                            <tr>
                            <th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>Card</th>
                            <th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>Last Interval</th>
                            <th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>Wrong Answers</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                            <td style={{ border: '1px solid #ddd', padding: 8 }}>Current Card</td>
                            <td style={{ border: '1px solid #ddd', padding: 8 }}>
                                {currentCard.repetitionHistory ? formatMilliseconds(getLastInterval(currentCard.repetitionHistory)) : "New Card"}
                            </td>
                            <td style={{ border: '1px solid #ddd', padding: 8 }}>
                                {currentCard.repetitionHistory ? getWrongInRow(currentCard.repetitionHistory) : 0}
                            </td>
                            </tr>
                        </tbody>
                        </table>
                    )}
                </div>
            )}
            {!currentCard && (
                <div style={{ marginBottom: 10 }}>No card currently active in the queue.</div>
            )}
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
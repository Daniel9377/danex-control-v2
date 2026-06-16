export type AnonymizationMap = {
  tokens: Map<string, string>;
  reverse: Map<string, string>;
};

export function createAnonymizer(): AnonymizationMap {
  return {
    tokens: new Map(),
    reverse: new Map(),
  };
}

let entityCounter = 0;
let amountCounter = 0;
let placeCounter = 0;

export function resetCounters() {
  entityCounter = 0;
  amountCounter = 0;
  placeCounter = 0;
}

export function anonymize(map: AnonymizationMap, value: string, type: "entity" | "amount" | "place"): string {
  if (map.tokens.has(value)) {
    return map.tokens.get(value)!;
  }

  let token: string;
  if (type === "entity") {
    token = `ENTITY_${String(++entityCounter).padStart(3, "0")}`;
  } else if (type === "amount") {
    token = `AMOUNT_${String(++amountCounter).padStart(3, "0")}`;
  } else {
    token = `PLACE_${String(++placeCounter).padStart(3, "0")}`;
  }

  map.tokens.set(value, token);
  map.reverse.set(token, value);
  return token;
}

export function deanonymize(map: AnonymizationMap, text: string): string {
  let result = text;
  for (const [token, value] of map.reverse.entries()) {
    result = result.replaceAll(token, value);
  }
  return result;
}

export function anonymizeContext(
  map: AnonymizationMap,
  context: {
    clients?: Array<{ id: string; name: string }>;
    debts?: Array<{ person_name: string; amount: number; currency: string }>;
    owesMe?: Array<{ person_name: string; amount: number; currency: string }>;
    amounts?: Array<{ value: number; currency: string; label: string }>;
  }
): string {
  resetCounters();
  const lines: string[] = [];

  if (context.clients && context.clients.length > 0) {
    lines.push("Clients actifs:");
    for (const client of context.clients) {
      const token = anonymize(map, client.name, "entity");
      lines.push(`- ${token} (id: ${client.id.slice(0, 8)})`);
    }
  }

  if (context.debts && context.debts.length > 0) {
    lines.push("Je dois (dettes):");
    for (const debt of context.debts) {
      const nameToken = anonymize(map, debt.person_name, "entity");
      lines.push(`- ${nameToken}: ${debt.amount} ${debt.currency}`);
    }
  }

  if (context.owesMe && context.owesMe.length > 0) {
    lines.push("On me doit (creances):");
    for (const debt of context.owesMe) {
      const nameToken = anonymize(map, debt.person_name, "entity");
      lines.push(`- ${nameToken}: ${debt.amount} ${debt.currency}`);
    }
  }

  if (context.amounts && context.amounts.length > 0) {
    lines.push("Montants:");
    for (const amt of context.amounts) {
      lines.push(`- ${amt.label}: ${amt.value} ${amt.currency}`);
    }
  }

  return lines.join("\n");
}

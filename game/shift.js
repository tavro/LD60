// Shifts: each day is a timed shift with a takings target. When the time is up the doors close to
// new customers, and the shift ends once the last one has left. Too many walkouts end it early.
// Takings go into the bank only when the target is met, and pay for upgrades between shifts.
// Customers come in waves, with rush hours between calmer stretches
const SHIFT_LENGTH = 180;
// After closing, the shift ends anyway this much later, in case someone gets stuck
const CLOSING_LIMIT = 90;
const MAX_WALKOUTS = 5;
const FIRST_CUSTOMER = 5;
const RUSH_HOURS = [[45, 70], [120, 150]];
// Seconds between customers outside rush hours: on day 1, how much quicker each day, and the least
const CALM_INTERVAL = 18;
const CALM_SPEEDUP = 2.5;
const CALM_MIN = 8;
const RUSH_INTERVAL = 4.5;
const CALM_MAX_CUSTOMERS = 3;
const RUSH_MAX_CUSTOMERS = 6;

// Bought between shifts; `cost` has the price of each level
export const UPGRADES = [
    { id: "belt", name: "Faster belt", description: "The belt runs 50% faster.", cost: [20, 40] },
    { id: "shelf", name: "Extra shelf", description: "Another shelf for phones, then cameras.", cost: [30, 45] },
    { id: "alarm", name: "Door alarm", description: "Shoplifters get caught at the door.", cost: [40] },
];

export function createShift({ register, onEnd }) {
    let day = 0;
    let bank = 0;
    let takings = 0;
    let walkouts = 0;
    let elapsed = 0;
    let running = false;
    let spawnIn = 0;
    const levels = Object.fromEntries(UPGRADES.map(({ id }) => [id, 0]));

    function target(forDay = day) {
        return 20 + 15 * (forDay - 1);
    }

    function start(newDay) {
        day = newDay;
        takings = 0;
        walkouts = 0;
        elapsed = 0;
        spawnIn = FIRST_CUSTOMER;
        running = true;
    }

    function rushHour() {
        return RUSH_HOURS.some(([from, to]) => elapsed >= from && elapsed < to);
    }

    function open() {
        return running && elapsed < SHIFT_LENGTH;
    }

    // Whether another customer should come in now, given how many are in the shop
    function wantsCustomer(dt, customers) {
        if (!open()) return false;
        spawnIn -= dt;
        if (spawnIn > 0) return false;

        const rush = rushHour();
        spawnIn = rush ? RUSH_INTERVAL : Math.max(CALM_MIN, CALM_INTERVAL - (day - 1) * CALM_SPEEDUP);
        return customers < (rush ? RUSH_MAX_CUSTOMERS : CALM_MAX_CUSTOMERS);
    }

    function earn(amount) {
        takings += amount;
        if (amount > 0) register.playMoneySound();
    }

    function walkout() {
        walkouts++;
    }

    function timeLeft() {
        if (elapsed >= SHIFT_LENGTH) return "Closing";
        const seconds = Math.ceil(SHIFT_LENGTH - elapsed);
        return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    }

    function update(dt, customers) {
        if (!running) return;
        elapsed += dt;

        register.show({
            day,
            time: timeLeft(),
            takings,
            target: target(),
            walkouts,
            maxWalkouts: MAX_WALKOUTS,
            rush: rushHour(),
        });

        const failed = walkouts >= MAX_WALKOUTS;
        const closed = elapsed >= SHIFT_LENGTH && (customers === 0 || elapsed >= SHIFT_LENGTH + CLOSING_LIMIT);
        if (!failed && !closed) return;

        running = false;
        const success = !failed && takings >= target();
        if (success) bank += takings;
        onEnd({ day, success, takings, target: target(), walkouts, maxWalkouts: MAX_WALKOUTS, bank });
    }

    // The next level of each upgrade, with its price, or null for maxed out ones
    function upgradeOffers() {
        return UPGRADES.map((upgrade) => ({
            ...upgrade,
            level: levels[upgrade.id],
            price: upgrade.cost[levels[upgrade.id]] ?? null,
        }));
    }

    // Returns the new level, or null when it can't be afforded
    function buy(id) {
        const upgrade = UPGRADES.find((upgrade) => upgrade.id === id);
        const price = upgrade.cost[levels[id]];
        if (price === undefined || price > bank) return null;
        bank -= price;
        return ++levels[id];
    }

    return {
        start, update, wantsCustomer, earn, walkout, upgradeOffers, buy,
        get day() { return day; },
        get bank() { return bank; },
        get running() { return running; },
    };
}

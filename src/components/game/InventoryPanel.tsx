import { Hero } from '@/lib/types';
import { useGameStore } from '@/lib/game-store';

interface InventoryPanelProps {
  hero: Hero;
}

const RESOURCE_ICONS: Record<string, string> = {
  wood: '🪵', stone: '🪨', iron: '⚙️', food: '🍖', water: '💧'
};

export default function InventoryPanel({ hero }: InventoryPanelProps) {
  const closeInventory = useGameStore(s => s.closeInventory);
  const depositResources = useGameStore(s => s.depositResources);
  const gameState = useGameStore(s => s.gameState);
  const queuedActions = useGameStore(s => s.queuedActions);
  const pouch = hero.inventory.resourcePouch;

  // Check if hero can deposit (must be adjacent to their TC and no gather queued)
  const player = gameState?.players[hero.owner];
  const townCenter = player?.buildings.find(b => b.type === 'town_center');
  const isAdjacentToTC = townCenter
    ? Math.max(Math.abs(townCenter.position.q - hero.position.q), Math.abs(townCenter.position.r - hero.position.r)) <= 1
    : false;
  const hasQueuedGather = !!queuedActions[hero.id]?.gatherTile;
  const canDeposit = !!townCenter && isAdjacentToTC && !hasQueuedGather;

  // Calculate total resources in pouch (support both multi-resource and legacy formats)
  const pouchResources = pouch?.resources || {};
  const legacyAmount = (pouch?.resourceType && pouch?.resourceAmount) ? pouch.resourceAmount : 0;
  const multiResourceTotal = Object.values(pouchResources).reduce((sum, n) => sum + (n || 0), 0);
  const totalResources = multiResourceTotal > 0 ? multiResourceTotal : legacyAmount;
  const hasResources = totalResources > 0;

  // Get all resources in pouch for display
  const resourceEntries = Object.entries(pouchResources).filter(([, amount]) => (amount || 0) > 0);
  // Include legacy format if it exists and multi-resource is empty
  if (multiResourceTotal === 0 && pouch?.resourceType && legacyAmount > 0) {
    resourceEntries.push([pouch.resourceType, legacyAmount]);
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 pointer-events-auto" onClick={closeInventory}>
      <div className="bg-gray-900 border border-cyan-900/50 rounded-lg p-5 w-80" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-cyan-400 mb-4 uppercase tracking-wider">{hero.name}&apos;s Inventory</h2>

        {/* Resource Pouch - Main Feature */}
        <div className="mb-4 p-3 bg-gray-800 rounded border border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium text-gray-400">Resource Pouch</div>
            <div className="text-xs text-gray-500">{totalResources} / {pouch?.maxResourceAmount || 8}</div>
          </div>
          {hasResources ? (
            <div className="space-y-2">
              {resourceEntries.map(([type, amount]) => (
                <div key={type} className="flex items-center gap-2 text-sm">
                  <span className="text-lg">{RESOURCE_ICONS[type] || '📦'}</span>
                  <span className="text-white capitalize">{type}</span>
                  <span className="text-gray-500">x{amount}</span>
                </div>
              ))}
              {canDeposit && (
                <button
                  onClick={() => depositResources(hero.id)}
                  className="w-full mt-2 bg-cyan-900/50 hover:bg-cyan-800/60 border border-cyan-500/50 rounded px-3 py-1.5 text-cyan-400 text-xs uppercase tracking-wider"
                >
                  Deposit All
                </button>
              )}
            </div>
          ) : (
            <div className="text-gray-500 text-sm italic">Empty - gather resources to fill</div>
          )}
          <div className="mt-2 w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-500 transition-all"
              style={{ width: `${(totalResources / (pouch?.maxResourceAmount || 8)) * 100}%` }}
            />
          </div>
        </div>

        {/* Equipment Slots - Placeholder */}
        <div className="space-y-2 opacity-50">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Equipment (Coming Soon)</div>
          {['Head', 'Body', 'Hands', 'Feet', 'Accessory'].map(slot => (
            <div key={slot} className="flex items-center justify-between py-1 px-2 bg-gray-800/50 rounded text-sm">
              <span className="text-gray-500">{slot}</span>
              <span className="text-gray-600">Empty</span>
            </div>
          ))}
        </div>

        <button
          onClick={closeInventory}
          className="mt-4 w-full bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 font-bold py-2 px-4 rounded uppercase text-sm tracking-wider"
        >
          Close
        </button>
      </div>
    </div>
  );
}

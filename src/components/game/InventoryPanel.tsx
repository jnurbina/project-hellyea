import { Hero } from '@/lib/types';
import { useGameStore } from '@/lib/game-store';

interface InventoryPanelProps {
  hero: Hero;
}

export default function InventoryPanel({ hero }: InventoryPanelProps) {
  const toggleInventory = useGameStore(s => s.toggleInventory);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center" onClick={() => toggleInventory(hero.id)}>
      <div className="bg-gray-800 border border-gray-600 rounded-lg p-4 w-96" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">{hero.name}'s Inventory</h2>
        <div className="space-y-2">
          <div>
            <label className="block text-sm font-medium text-gray-400">Head</label>
            <select className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-600 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md bg-gray-700 text-white">
              <option>None</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400">Body</label>
            <select className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-600 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md bg-gray-700 text-white">
              <option>None</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400">Hands</label>
            <select className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-600 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md bg-gray-700 text-white">
              <option>None</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400">Feet</label>
            <select className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-600 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md bg-gray-700 text-white">
              <option>None</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400">Resource Pouch</label>
            <select className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-600 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md bg-gray-700 text-white">
              <option>None</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400">Accessory</label>
            <select className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-600 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md bg-gray-700 text-white">
              <option>None</option>
            </select>
          </div>
        </div>
        <button
          onClick={() => toggleInventory(hero.id)}
          className="mt-4 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded"
        >
          Close
        </button>
      </div>
    </div>
  );
}

import { Link } from 'react-router-dom';
import { History, Plus, Sigma } from 'lucide-react';
import { Button, Badge } from '../../components/ui';
import { ParametricHistory } from './ParametricHistory';

export default function ParametricHistoryPage() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-carbon dark:text-white flex items-center gap-2">
            <History size={22} /> Historical Data <Badge variant="info"><Sigma size={10} /> PE</Badge>
          </h1>
          <p className="text-sm text-coolslate mt-0.5">Review previously saved and imported Parametric Estimations</p>
        </div>
        <Link to="/parametric-estimation"><Button size="sm" icon={<Plus size={15} />}>New Estimation</Button></Link>
      </div>

      <ParametricHistory />
    </div>
  );
}

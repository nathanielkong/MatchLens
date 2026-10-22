import {lazy,Suspense} from 'react';
import {Home} from './Home';
const MatchRoom=lazy(()=>import('./MatchRoom'));
export default function App(){
 return window.location.pathname.replace(/\/+$/,'')==='/match-room'?<Suspense fallback={<main className="route-loading" role="status">Opening the match room…</main>}><MatchRoom/></Suspense>:<Home/>;
}

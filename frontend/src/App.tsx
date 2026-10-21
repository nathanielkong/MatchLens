import {Home} from './Home';
import MatchRoom from './MatchRoom';
export default function App(){
 return window.location.pathname.replace(/\/+$/,'')==='/match-room'?<MatchRoom/>:<Home/>;
}

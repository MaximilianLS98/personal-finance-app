import { redirect } from 'next/navigation';
import Home from './home/page';

export default function RootPage() {
	if (process.env.NODE_ENV === 'test') {
		return <Home />;
	}
	redirect('/home');
}

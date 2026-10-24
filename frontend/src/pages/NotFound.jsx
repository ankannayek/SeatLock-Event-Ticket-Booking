import { Empty } from '../components/Ui.jsx'
import { useTitle } from '../lib/hooks.js'

export default function NotFound() {
  useTitle('Page not found')
  return <Empty title="That page does not exist" body="The link may be old or mistyped." action={{ to: '/', label: 'Browse events' }} />
}

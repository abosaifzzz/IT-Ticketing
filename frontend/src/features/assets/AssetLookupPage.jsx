import {Link,useParams} from 'react-router-dom'
import {Button} from '../../components/ui/Button'
import {useApiQuery} from '../../services/http/useApiQuery'
import {assetManagementService as service} from '../../services/assets/assetManagementService'

export function AssetLookupPage(){const {tag}=useParams(),query=useApiQuery(tag,signal=>service.lookup(tag,signal));return <div className="mx-auto max-w-2xl"><div className="page-heading"><div><p className="eyebrow">التحقق من الأصل</p><h1>البحث برمز الأصل</h1></div></div>{query.error?<p className="content-card" role="alert">{query.error.message}</p>:query.status==='loading'?<p className="content-card" role="status">جارٍ التحقق...</p>:<section className="content-card"><h2 className="text-xl font-bold text-ink"><bdi dir="ltr">{query.data.asset_tag}</bdi></h2><p className="mt-2 text-muted">{query.data.brand} {query.data.model}</p><Button className="mt-5" as={Link} to={`/it/assets/registry/${query.data.id}`}>فتح سجل الأصل</Button></section>}</div>}

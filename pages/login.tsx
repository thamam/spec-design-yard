import { RemoteLoginPage } from "@/components/workspace/remote-login"
import { loginPageGuard } from "@/lib/server-auth"

export default RemoteLoginPage

export const getServerSideProps = loginPageGuard

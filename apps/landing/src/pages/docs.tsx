import { mount } from "../site/mount";
import { DocsPage } from "./DocsPage";
import "../styles/base.css";
import "../styles/header.css";
import "../styles/sections.css";
import "../styles/footer.css";
import "../styles/page.css";
import "../styles/docs.css";

mount(<DocsPage path={location.pathname} />);

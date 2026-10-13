import { Btn, IconBtn } from "@/components/ui/button";
import { Logo, Icon } from "@/components/ui/icons";

export function ChatFoundation() {
  return (
    <div className="pagecol">
      <header className="chead">
        <div>
          <div className="ctitle">Conversation</div>
          <p className="csub">Chat is being prepared</p>
        </div>
        <span className="hpill hpill-dark" style={{ marginLeft: "auto" }}>
          <Icon n="shield" s={14} />
          Context unavailable
        </span>
        <IconBtn
          icon="bell"
          size={44}
          title="Notifications unavailable"
          disabled
        />
      </header>
      <div className="msgs">
        <div className="empty">
          <div>
            <Logo s={44} />
            <h1 className="display-sm display">
              How can I help with
              <br />
              your health today?
            </h1>
            <p className="esub">
              Tell me what you’re experiencing, ask about your health history,
              or just talk normally.
            </p>
            <div className="qrow">
              <Btn sm icon="chat" disabled>
                Describe how you feel
              </Btn>
              <Btn sm icon="heart" disabled>
                Review my health
              </Btn>
              <Btn sm icon="doc" disabled>
                Add a document
              </Btn>
            </div>
            <p className="foundation-notice" id="composer-status">
              Chat, health review and uploads are not available yet. Nothing
              entered here is saved.
            </p>
          </div>
        </div>
      </div>
      <div className="composer">
        <IconBtn
          icon="clip"
          size={44}
          title="Attachments unavailable"
          disabled
        />
        <IconBtn
          icon="mic"
          size={44}
          title="Voice input unavailable"
          disabled
        />
        <input
          className="cinput"
          aria-label="Message"
          aria-describedby="composer-status"
          placeholder="Chat is not available yet"
          readOnly
        />
        <IconBtn icon="up" size={50} title="Send unavailable" disabled />
      </div>
    </div>
  );
}

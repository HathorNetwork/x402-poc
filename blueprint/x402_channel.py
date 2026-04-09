from hathor import (
    Address, Amount, Blueprint, Context, NCDepositAction, NCFail,
    NCWithdrawalAction, Timestamp, TokenUid, export, public, view
)

PHASE_OPEN = 'OPEN'
PHASE_CLOSED = 'CLOSED'


@export
class X402Channel(Blueprint):
    buyer: Address
    facilitator: Address
    token_uid: TokenUid
    total_deposited: Amount
    total_spent: Amount
    phase: str
    deadline: Timestamp

    @public(allow_deposit=True)
    def initialize(
        self,
        ctx: Context,
        facilitator: Address,
        token_uid: TokenUid,
        deadline: Timestamp,
    ) -> None:
        action = ctx.get_single_action(token_uid)
        if not isinstance(action, NCDepositAction):
            raise NCFail("Must include a deposit action")

        self.buyer = ctx.get_caller_address()
        self.facilitator = facilitator
        self.token_uid = token_uid
        self.total_deposited = action.amount
        self.total_spent = 0
        self.phase = PHASE_OPEN
        self.deadline = deadline

    @public(allow_withdrawal=True)
    def spend(self, ctx: Context, amount: Amount, seller: Address) -> None:
        caller = ctx.get_caller_address()
        if caller != self.facilitator:
            raise NCFail("Only the facilitator can spend")
        if self.phase != PHASE_OPEN:
            raise NCFail("Channel is not open")
        if self.total_spent + amount > self.total_deposited:
            raise NCFail("Insufficient channel balance")

        action = ctx.get_single_action(self.token_uid)
        if not isinstance(action, NCWithdrawalAction):
            raise NCFail("Must include a withdrawal action")
        if action.amount != amount:
            raise NCFail("Withdrawal amount must match spend amount")

        self.total_spent = self.total_spent + amount

    @public(allow_deposit=True)
    def top_up(self, ctx: Context) -> None:
        caller = ctx.get_caller_address()
        if caller != self.buyer:
            raise NCFail("Only the buyer can top up")
        if self.phase != PHASE_OPEN:
            raise NCFail("Channel is not open")

        action = ctx.get_single_action(self.token_uid)
        if not isinstance(action, NCDepositAction):
            raise NCFail("Must include a deposit action")

        self.total_deposited = self.total_deposited + action.amount

    @public(allow_withdrawal=True)
    def close(self, ctx: Context) -> None:
        caller = ctx.get_caller_address()

        if self.phase != PHASE_OPEN:
            raise NCFail("Channel is already closed")

        if caller != self.buyer and caller != self.facilitator:
            if ctx.block.timestamp < self.deadline:
                raise NCFail("Only buyer or facilitator can close before deadline")

        remaining = self.total_deposited - self.total_spent
        if remaining > 0:
            action = ctx.get_single_action(self.token_uid)
            if not isinstance(action, NCWithdrawalAction):
                raise NCFail("Must include a withdrawal action")
            if action.amount != remaining:
                raise NCFail("Must withdraw exact remaining balance")

        self.phase = PHASE_CLOSED

    @view
    def get_remaining(self) -> Amount:
        return self.total_deposited - self.total_spent
